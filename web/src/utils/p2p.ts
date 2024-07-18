import { sendP2PSignaling } from '~/endpoints';
import { EventBus } from '~/utils/event-bus.ts';
import { wait } from './wait';

const PING = new Uint8Array([0x70, 0x69, 0x6e, 0x67]);
const PONG = new Uint8Array([0x70, 0x6f, 0x6e, 0x67]);

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
  RTT_CHANGE: number;
} & Record<PacketFlag, ArrayBuffer>;

export interface RTCImpl extends EventBus<RTCEvents> {
  protocol: 'webrtc' | 'websocket';
  rtt: number;

  send(bytes: Uint8Array, flag?: PacketFlag): void;

  waitForDrain(): Promise<void>;

  ping(): Promise<number>;

  recv(): AsyncGenerator<ArrayBuffer>;

  close(): void;
}

export class P2PRtc extends EventBus<RTCEvents> implements RTCImpl {
  readonly conn = new RTCPeerConnection();
  private channel: RTCDataChannel | undefined;
  private established = false;
  public readonly protocol = 'webrtc';
  public rtt = 0;

  public constructor(
    readonly requestId: string,
    readonly clientId: string,
  ) {
    super();
    this.conn.addEventListener('icecandidate', async (evt) => {
      if (!evt.candidate) return void 0;
      await this.sendSignaling([1, evt.candidate]);
    });
    this.on(PacketFlag.PING, (buffer) => {
      if (buffer.byteLength != PING.byteLength) return void 0;
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < PING.byteLength; i++) {
        if (bytes.byteLength != PING.byteLength) return void 0;
      }
      this.send(PONG, PacketFlag.PONG);
    });
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
      this.runIntervalPing();
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
    const channel = this.conn.createDataChannel('default', {
      ordered: false,
      maxRetransmits: 0,
    });
    await this.initSenderChannel(channel);
    const offer = await this.conn.createOffer();
    await this.sendSignaling([0, offer]);
    await this.conn.setLocalDescription(offer);
    this.init();
  }

  public async createReceiver(offer: RTCSessionDescriptionInit) {
    this.conn.addEventListener('datachannel', this.ondatachannel);
    await this.conn.setRemoteDescription(offer);
    const answer = await this.conn.createAnswer();
    await this.sendSignaling([0, answer]);
    await this.conn.setLocalDescription(answer);
    this.init();
  }

  private async init() {
    // this.conn.addEventListener('')
    // 处理 WebRTC 各种事件
  }

  public async setAnswer(answer: RTCSessionDescriptionInit) {
    await this.conn.setRemoteDescription(answer);
  }

  public async addIceCandidate(candidate: RTCIceCandidate) {
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
      console.log('receive chanel opened');
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
      console.error('WebRTC DataChannel error', evt, channel);
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
      console.log('send chanel opened');
    });
    channel.addEventListener('close', () => {
      console.log('send chanel closed');
      if (!this.established) return void 0;
      this.emit('CONNECTION_CLOSE', {
        code: 1007,
        reason: `DataChannel closed unexpectedly`,
      });
      this.close(false);
    });
    channel.addEventListener('message', this.onmessage);
    channel.addEventListener('error', (evt) => {
      console.error('WebRTC DataChannel error', evt, channel);
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
  }

  private runIntervalPing = async () => {
    while (true) {
      try {
        if (
          !this.channel ||
          this.channel.readyState !== 'open' ||
          !this.established
        ) {
          break;
        }
        await this.ping();
        await wait(5000);
      } catch {
        this.close(false);
        return void 0;
      }
    }
  };

  public async ping(): Promise<number> {
    const start = Date.now();
    this.send(PING, PacketFlag.PING);
    await new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.off(PacketFlag.PONG, handle);
        reject(new Error('timeout'));
      }, 5000);
      const handle = (buffer: ArrayBuffer) => {
        window.clearTimeout(timer);
        if (buffer.byteLength != PONG.byteLength) {
          resolve(false);
          return void 0;
        }
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < PONG.byteLength; i++) {
          if (bytes.byteLength != PONG.byteLength) {
            resolve(false);
            return void 0;
          }
        }
        resolve(true);
      };
      this.once(PacketFlag.PONG, handle);
    });
    this.rtt = Math.ceil((Date.now() - start + this.rtt) / 2);
    this.emit('RTT_CHANGE', this.rtt);
    return this.rtt;
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

export class P2PSocket extends EventBus<RTCEvents> implements RTCImpl {
  readonly ws: WebSocket;
  private established = false;
  public readonly protocol = 'websocket';
  public rtt = 0;

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
      console.log('websocket closed');
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
    this.on(PacketFlag.PING, (buffer) => {
      if (buffer.byteLength != PING.byteLength) return void 0;
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < PING.byteLength; i++) {
        if (bytes.byteLength != PING.byteLength) return void 0;
      }
      this.send(PONG, PacketFlag.PONG);
    });
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
      this.runIntervalPing();
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

  private runIntervalPing = async () => {
    while (true) {
      try {
        if (this.ws.readyState !== this.ws.OPEN || !this.established) {
          break;
        }
        await this.ping();
        await wait(5000);
      } catch {
        this.close(false);
        return void 0;
      }
    }
  };

  public async ping(): Promise<number> {
    const start = Date.now();
    this.send(PING, PacketFlag.PING);
    const valid = await new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.off(PacketFlag.PONG, handle);
        reject(new Error('ping timeout'));
      }, 1000);
      const handle = (buffer: ArrayBuffer) => {
        window.clearTimeout(timer);
        if (buffer.byteLength != PONG.byteLength) {
          resolve(false);
          return void 0;
        }
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < PONG.byteLength; i++) {
          if (bytes.byteLength != PONG.byteLength) {
            resolve(false);
            return void 0;
          }
        }
        resolve(true);
      };
      this.once(PacketFlag.PONG, handle);
    });
    if (!valid) throw new Error('invalid');
    this.rtt = Math.ceil((Date.now() - start + this.rtt) / 2);
    this.emit('RTT_CHANGE', this.rtt);
    return this.rtt;
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
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint32(0, int, true);
  return new Uint8Array(buf);
};
// const u8array2int = (buf: Uint8Array): number => {
//   const view = new DataView(buf.buffer);
//   return view.getInt32(0, true);
// };
