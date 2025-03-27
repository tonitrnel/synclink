import { sendP2PSignaling } from '~/endpoints';
import { EventBus } from '~/utils/event-bus.ts';
import { wait } from './wait';

const PING_OPCODE = new Uint8Array([0x70, 0x69, 0x6e, 0x67]);
const PONG_OPCODE = new Uint8Array([0x70, 0x6f, 0x6e, 0x67]);

export enum PacketFlag {
  // 客户端使用 0x01 ~ 0xEF
  PING = 0x01,
  PONG = 0x02,
  META = 0x03,
  DATA = 0x04,
  SHAKEHAND = 0x05,
  ACK = 0x06,
  PEER_CLOSE = 0x07,
  // 服务端保留 0xF0 ~ 0xFF
  RESERVED = 0xf0,
  // 仅 Socket 服务端使用
  PROXY_CONNECTION_READY = 0xf1, // 和服务端连接已就绪
  PROXY_CONNECTION_ESTABLISHED = 0xf2, // 和另一个客户端已建立连接
  PROXY_CONNECTION_CLOSE = 0xf3, // 和服务端连接已关闭
  PROXY_WHO = 0xf4,
  PROXY_HEARTBEAT = 0xfe,
  PROXY_ERROR = 0xff,
}

export type RTCEvents = {
  CONNECTION_READY: void;
  CONNECTION_CLOSE: {
    code: number;
    reason: string;
  };
  CONNECTION_ERROR: {
    source: Event;
    message: string;
  };
  RTT_UPDATED: number;
} & Record<PacketFlag, ArrayBuffer>;

export abstract class RTCImpl extends EventBus<RTCEvents> {
  abstract protocol: 'webrtc' | 'websocket';
  rtt = 0;
  private nextPingActiveTime = 0;

  abstract send(bytes: Uint8Array, flag?: PacketFlag): void;

  abstract waitForDrain(): Promise<void>;

  public ping = async (): Promise<number> => {
    const startTime = Date.now();
    this.nextPingActiveTime = startTime + 30_000;

    // [OPCODE:4 bytes, SEQ: 2 bytes, TIME: 8 bytes]
    const packet = new Uint8Array(14);
    const seq = Math.floor(Math.random() * 10000);
    packet.set(PING_OPCODE, 0);
    new DataView(packet.buffer, 4, 2).setUint16(0, seq, true);
    packet.set(int2u8array(startTime), 6);

    this.send(packet, PacketFlag.PING);

    const replyTime = await new Promise<number>((resolve, reject) => {
      const timeoutDuration = 5000; // 5 seconds timeout
      const timerId = window.setTimeout(() => {
        this.off(PacketFlag.PONG, pongHandler);
        reject(
          new Error('Ping test timed out after ' + timeoutDuration + ' ms'),
        );
      }, timeoutDuration);
      const pongHandler = (buffer: ArrayBuffer) => {
        if (buffer.byteLength !== 14) {
          return void 0;
        }
        const receivedBytes = new Uint8Array(buffer);
        if (
          !receivedBytes
            .subarray(0, 4)
            .every((byte, index) => byte === PONG_OPCODE[index])
        ) {
          return;
        }
        if (
          new DataView(receivedBytes.buffer, 4, 2).getUint16(0, true) !== seq
        ) {
          return void 0;
        }
        window.clearTimeout(timerId);
        this.off(PacketFlag.PONG, pongHandler);
        const receivedTime = receivedBytes.subarray(6, 14);
        resolve(u8array2int(receivedTime));
      };
      this.on(PacketFlag.PONG, pongHandler);
    });
    this.rtt = Math.max(Math.ceil((replyTime - startTime + this.rtt) / 2), 0);
    this.emit('RTT_UPDATED', this.rtt);
    return this.rtt;
  };

  protected pong = (buffer: ArrayBuffer) => {
    if (buffer.byteLength != 14) return void 0;
    const bytes = new Uint8Array(buffer);
    if (
      bytes.subarray(0, 4).some((byte, index) => byte != PING_OPCODE[index])
    ) {
      return void 0;
    }
    const seq = new DataView(bytes.buffer, 4, 2).getUint16(0, true);
    const startTime = u8array2int(bytes.subarray(6, 14));
    const replyTime = Date.now();

    const packet = new Uint8Array(14);
    packet.set(PONG_OPCODE, 0);
    new DataView(packet.buffer, 4, 2).setUint16(0, seq, true);
    packet.set(int2u8array(replyTime), 6);
    this.send(packet, PacketFlag.PONG);

    this.rtt = Math.max(Math.ceil((replyTime - startTime + this.rtt) / 2), 0);
    this.nextPingActiveTime = replyTime + 5000;
    this.emit('RTT_UPDATED', this.rtt);
  };

  protected sendPing = () => {
    if (Date.now() < this.nextPingActiveTime) return void 0;
    this.ping();
  };

  abstract recv(): AsyncGenerator<ArrayBuffer>;

  abstract close(): void;
}

export class P2PRtc extends RTCImpl {
  readonly conn = new RTCPeerConnection();
  private channel: RTCDataChannel | undefined;
  private established = false;
  public readonly protocol = 'webrtc';
  public rtt = 0;
  public MAC_PACKET_SIZE = 16 * 1024;

  public constructor(
    readonly requestId: string,
    readonly clientId: string,
  ) {
    super();
    this.conn.addEventListener('icecandidate', async (evt) => {
      if (!evt.candidate) return void 0;
      await this.sendSignaling([1, evt.candidate]);
    });
    this.on(PacketFlag.PING, (buffer) => this.pong(buffer));
    this.on(PacketFlag.SHAKEHAND, (buf) => {
      if (this.established) return void 0;
      const id = u8array2uuid(new Uint8Array(buf.slice(0, 16)));
      if (id !== this.requestId) return void 0;
      this.established = true;
      this.send(
        new Uint8Array([
          ...uuid2u8array(this.requestId),
          ...int2u8array(Date.now()),
        ]),
        PacketFlag.SHAKEHAND,
      );
      this.emit('CONNECTION_READY');
      if (this.conn.sctp?.maxMessageSize) {
        console.log(
          `maxMessageSize: ${this.conn.sctp.maxMessageSize / 1024}kb maxChannels:${this.conn.sctp.maxChannels}`,
        );
        this.MAC_PACKET_SIZE = this.conn.sctp.maxMessageSize - 16; // 预留 16 bytes 的元数据空间
      }
    });
    this.on(PacketFlag.PEER_CLOSE, () => {
      this.emit('CONNECTION_CLOSE', {
        code: 1000,
        reason: 'Connection closed cleanly',
      });
      this.close(false);
    });
  }

  public async createSender() {
    console.log('create sender channel');
    const channel = this.conn.createDataChannel('default', {
      ordered: false,
      maxRetransmits: 0,
    });
    await this.initSenderChannel(channel);
    const offer = await this.conn.createOffer();
    await this.sendSignaling([0, offer]);
    await this.conn.setLocalDescription(offer);
    await this.init();
  }

  public async createReceiver(offer: RTCSessionDescriptionInit) {
    console.log('create receiver channel');
    this.conn.addEventListener('datachannel', this.ondatachannel);
    await this.conn.setRemoteDescription(offer);
    const answer = await this.conn.createAnswer();
    await this.sendSignaling([0, answer]);
    await this.conn.setLocalDescription(answer);
    await this.init();
  }

  private async init() {
    // 处理 WebRTC 各种事件
    this.conn.addEventListener('icecandidateerror', (evt) => {
      console.error(`icecandidateerror`, evt);
    });
    this.conn.addEventListener('connectionstatechange', (evt) => {
      console.log('connectionstatechange', this.conn.connectionState, evt);
    });
    this.conn.addEventListener('iceconnectionstatechange', (evt) => {
      console.log(
        `iceconnectionstatechange`,
        evt,
        this.conn.iceConnectionState,
      );
    });
    this.conn.addEventListener('icegatheringstatechange', (evt) => {
      console.log(`icegatheringstatechange`, evt, this.conn.iceGatheringState);
    });
    this.conn.addEventListener('signalingstatechange', (evt) => {
      console.log(`signalingstatechange`, evt, this.conn.signalingState);
    });
  }

  public async setAnswer(answer: RTCSessionDescriptionInit) {
    console.log('setAnswer');
    await this.conn.setRemoteDescription(answer);
  }

  public async addIceCandidate(candidate: RTCIceCandidate) {
    console.log('addIceCandidate');
    await this.conn.addIceCandidate(candidate);
  }

  private ondatachannel = async (evt: RTCDataChannelEvent) => {
    console.log('receive channel data');
    const channel = evt.channel;
    await this.initRecvChannel(channel);
  };
  private onmessage = async (evt: MessageEvent) => {
    if (!(evt.data instanceof ArrayBuffer)) {
      return void 0;
    }
    const dataView = new DataView(evt.data);
    const flag: PacketFlag = dataView.getUint8(0);
    const payload = evt.data.slice(1);
    this.emit(flag, payload);
    // console.log('P2PRtc', PacketFlag[flag], payload);
  };
  private initRecvChannel = async (channel: RTCDataChannel) => {
    channel.binaryType = 'arraybuffer';
    channel.addEventListener('open', () => {
      console.log('receiver chanel opened');
    });
    channel.addEventListener('close', () => {
      console.log('receive chanel closed');
      if (!this.established) return void 0;
      this.emit('CONNECTION_CLOSE', {
        code: 1007,
        reason: `DataChannel closed unexpectedly`,
      });
      this.close(false);
    });
    channel.addEventListener('message', this.onmessage);
    channel.addEventListener('error', (evt) => {
      console.error('WebRTC Receiver DataChannel error', evt, channel);
      this.emit('CONNECTION_ERROR', {
        source: evt,
        message: 'WebRTC DataChannel error',
      });
    });
    this.channel = channel;
    this.send(
      new Uint8Array([
        ...uuid2u8array(this.requestId),
        ...int2u8array(Date.now()),
      ]),
      PacketFlag.SHAKEHAND,
    );
  };
  private initSenderChannel = async (channel: RTCDataChannel) => {
    channel.binaryType = 'arraybuffer';
    channel.addEventListener('open', () => {
      console.log('sender chanel opened');
    });
    channel.addEventListener('close', () => {
      console.log('sender chanel closed');
      if (!this.established) return void 0;
      this.emit('CONNECTION_CLOSE', {
        code: 1007,
        reason: `DataChannel closed unexpectedly`,
      });
      this.close(false);
    });
    channel.addEventListener('message', this.onmessage);
    channel.addEventListener('error', (evt) => {
      console.error('WebRTC Sender DataChannel error', evt, channel);
      this.emit('CONNECTION_ERROR', {
        source: evt,
        message: 'WebRTC DataChannel error',
      });
    });
    this.channel = channel;
  };
  private sendSignaling = async (
    value: [0, RTCSessionDescriptionInit] | [1, RTCIceCandidate],
  ) => {
    try {
      await sendP2PSignaling({
        body: {
          request_id: this.requestId,
          client_id: this.clientId,
          payload: value,
        },
      });
    } catch (e) {
      console.error('Failed to send signaling', e);
    }
  };

  public async waitForDrain(): Promise<void> {
    if (
      !this.channel ||
      this.channel.readyState !== 'open' ||
      !this.established
    )
      return void 0;
    while (this.channel && this.channel.bufferedAmount > 0) {
      await wait(16);
    }
  }

  public send(bytes: Uint8Array, flag = PacketFlag.DATA) {
    if (!this.channel) {
      throw new Error('No established connection');
    }
    const buffer = new ArrayBuffer(1 + bytes.byteLength);
    const view = new Uint8Array(buffer);
    view[0] = flag;
    view.set(bytes, 1);
    this.channel.send(buffer);
    this.sendPing();
  }

  public async *recv(): AsyncGenerator<ArrayBuffer> {
    if (!this.channel) {
      throw new Error('No established connection');
    }
    const receiver = this.channel;
    if (receiver.readyState === 'connecting') {
      await new Promise<void>((resolve) =>
        receiver.addEventListener('open', () => resolve()),
      );
    }
    const bufferQueue: ArrayBuffer[] = [];
    let resolveNext: ((bytes: ArrayBuffer) => void) | undefined = undefined;
    const release = this.on(PacketFlag.DATA, (buf) => {
      if (resolveNext) {
        resolveNext(buf);
        resolveNext = undefined;
      } else {
        if (bufferQueue.length >= 16) {
          throw new Error('Excessive accumulation');
        }
        bufferQueue.push(buf);
      }
    });
    const nextBuffer = () =>
      new Promise<ArrayBuffer>((resolve) => {
        if (bufferQueue.length > 0) {
          resolve(bufferQueue.shift()!);
        } else {
          resolveNext = resolve;
        }
      });
    try {
      while (true) {
        if (!this.channel || this.channel.readyState !== 'open') break;
        yield await nextBuffer();
      }
    } catch {
      console.log('receiver terminated');
      release();
    }
  }

  public close(notifyPeer = true) {
    this.established = false;
    if (notifyPeer && this.channel && this.channel.readyState == 'open') {
      this.channel.send(new Uint8Array([PacketFlag.PEER_CLOSE]));
    }
    this.channel?.close();
    this.conn.close();
    this.channel = undefined;
  }
}

export class P2PSocket extends RTCImpl {
  readonly ws: WebSocket;
  private established = false;
  public readonly protocol = 'websocket';

  public constructor(
    readonly requestId: string,
    readonly clientId: string,
  ) {
    super();
    const protocol = location.protocol == 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(
      `${protocol}://${new URL(__ENDPOINT__ || window.location.origin).host}/api/p2p/socket`,
    );
    this.init().catch(console.error);
  }

  async init() {
    this.ws.binaryType = 'arraybuffer';
    this.ws.addEventListener('open', this.onopen, { once: true });
    this.ws.addEventListener('message', this.onmessage);
    this.ws.addEventListener('close', (evt) => {
      console.log('websocket closed, reason:', evt.reason);
      if (!this.established) return void 0;
      this.emit('CONNECTION_CLOSE', {
        code: 1006,
        reason: `Unexpected closure, code=${evt.code}, reason=${evt.reason}`,
      });
      this.established = false;
    });
    this.ws.addEventListener('error', (evt) => {
      console.error('websocket error', evt);
      this.emit('CONNECTION_ERROR', {
        source: evt,
        message: 'WebSocket error',
      });
    });
    this.on(PacketFlag.PROXY_CONNECTION_ESTABLISHED, () => {
      this.send(
        new Uint8Array([
          ...uuid2u8array(this.requestId),
          ...int2u8array(Date.now()),
        ]),
        PacketFlag.SHAKEHAND,
      );
    });
    this.on(PacketFlag.PING, (buffer) => this.pong(buffer));
    this.on(PacketFlag.SHAKEHAND, (buf) => {
      if (this.established) return void 0;
      const id = u8array2uuid(new Uint8Array(buf.slice(0, 16)));
      if (id !== this.requestId) return void 0;
      this.established = true;
      this.send(
        new Uint8Array([
          ...uuid2u8array(this.requestId),
          ...int2u8array(Date.now()),
        ]),
        PacketFlag.SHAKEHAND,
      );
      this.emit('CONNECTION_READY');
    });
    this.on(PacketFlag.PEER_CLOSE, () => {
      this.emit('CONNECTION_CLOSE', {
        code: 1000,
        reason: 'Connection closed cleanly',
      });
      this.close(false);
    });
    this.on(PacketFlag.PROXY_CONNECTION_CLOSE, () => {
      if (!this.established) return void 0;
      this.emit('CONNECTION_CLOSE', {
        code: 1005,
        reason: 'Abnormal closure, no close frame received',
      });
      this.ws.close(1000, 'Peer abnormal closure');
      this.established = false;
    });
  }

  private onopen = async () => {
    console.log('websocket opened');
    const bytes = new Uint8Array(32);
    bytes.set(uuid2u8array(this.requestId), 0);
    bytes.set(uuid2u8array(this.clientId), 16);
    this.send(bytes, PacketFlag.PROXY_WHO);
  };
  private onmessage = async (evt: MessageEvent) => {
    if (!(evt.data instanceof ArrayBuffer)) {
      return void 0;
    }
    const dataView = new DataView(evt.data);
    const flag: PacketFlag = dataView.getUint8(0);
    const payload = evt.data.slice(1);
    this.emit(flag, payload);
    // console.log('P2PSocket', PacketFlag[flag], payload);
  };

  public async waitForDrain(): Promise<void> {
    if (this.ws.readyState !== this.ws.OPEN || !this.established) return void 0;
    while (this.ws.bufferedAmount > 0) {
      await wait(16);
    }
  }

  public send(bytes: Uint8Array, flag = PacketFlag.DATA) {
    if (this.ws.readyState !== this.ws.OPEN) {
      throw new Error('No established connection');
    }
    const buffer = new ArrayBuffer(1 + bytes.byteLength);
    const view = new Uint8Array(buffer);
    view[0] = flag;
    view.set(bytes, 1);
    this.ws.send(buffer);
    // this.ws.bufferedAmount
    this.sendPing();
  }

  public async *recv(): AsyncGenerator<ArrayBuffer, void> {
    if (
      this.ws.readyState !== this.ws.OPEN &&
      this.ws.readyState !== this.ws.CONNECTING
    ) {
      throw new Error('No established connection');
    }
    if (!this.established) {
      await new Promise<void>((resolve) =>
        this.once(PacketFlag.PROXY_CONNECTION_ESTABLISHED, () => resolve()),
      );
    }
    const bufferQueue: ArrayBuffer[] = [];
    let resolveNext: ((bytes: ArrayBuffer) => void) | undefined = undefined;
    const release = this.on(PacketFlag.DATA, (buf) => {
      if (resolveNext) {
        resolveNext(buf);
        resolveNext = undefined;
      } else {
        if (bufferQueue.length >= 16) {
          throw new Error(`Excessive accumulation`);
        }
        bufferQueue.push(buf);
      }
    });
    const nextBuffer = () =>
      new Promise<ArrayBuffer>((resolve) => {
        if (bufferQueue.length > 0) {
          resolve(bufferQueue.shift()!);
        } else {
          resolveNext = resolve;
        }
      });
    try {
      while (true) {
        if (this.ws.readyState !== this.ws.OPEN || !this.established) break;
        yield await nextBuffer();
      }
    } finally {
      release();
    }
  }

  public close(notifyPeer = true) {
    if (notifyPeer && this.ws.readyState == this.ws.OPEN) {
      this.ws.send(new Uint8Array([PacketFlag.PEER_CLOSE]));
    }
    this.ws.close();
    this.established = false;
  }
}

const uuid2u8array = (uuid: string): Uint8Array => {
  const bytes = new Uint8Array(16);
  const cleanUuid = uuid.replace(/-/g, '');
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(cleanUuid.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};
const u8array2uuid = (buf: Uint8Array): string => {
  if (buf.length !== 16) {
    throw new Error('Uint8Array must be exactly 16 bytes long');
  }
  const hexParts = Array.from(buf).map((byte) =>
    byte.toString(16).padStart(2, '0'),
  );
  const part = (start: number, end: number) =>
    hexParts.slice(start, end).join('');
  return `${part(0, 4)}-${part(4, 6)}-${part(6, 8)}-${part(8, 10)}-${part(10, 16)}`;
};
const int2u8array = (int: number): Uint8Array => {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setBigUint64(0, BigInt(int), true);
  return new Uint8Array(buf);
};
const u8array2int = (buf: Uint8Array): number => {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return Number(view.getBigUint64(0, true));
};
