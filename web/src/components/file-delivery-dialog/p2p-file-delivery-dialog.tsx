import {
  ChangeEvent,
  FC,
  memo,
  ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  InferResponse,
  useDeleteDiscardP2PRequest,
  useGetSseConnections,
  usePostCreateP2PRequest,
} from '~/endpoints';
import { notifyManager } from '~/utils/notify-manager.ts';
import { P2PRtc, P2PSocket, PacketFlag, RTCImpl } from '~/utils/p2p.ts';
import { Dialog } from 'primereact/dialog';
import { Divider } from 'primereact/divider';
import { getBrowserInfo, getDeviceType } from '~/utils/get-device-type.ts';
import {
  LaptopIcon,
  PcCaseIcon,
  SmartphoneIcon,
  TabletIcon,
  UploadIcon,
  XCircleIcon,
  XIcon,
} from 'icons';
import { Button } from 'primereact/button';
import { Loading } from '~/components/loading';
import { t } from '@lingui/macro';
import { InputSwitch, InputSwitchChangeEvent } from 'primereact/inputswitch';
import { InputOtp, InputOtpChangeEvent } from 'primereact/inputotp';
import { withProduce } from '~/utils/with-produce';
import { clsx } from '~/utils/clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { formatBytes } from '~/utils/format-bytes';
import { useLatestRef } from '@painted/shared';
import { createTransmissionRateCalculator } from '~/utils/transmission-rate-calculator';

type Panel =
  | {
      key: 'loading';
      element: ReactElement;
    }
  | {
      key: 'first';
      element: ReactElement;
    }
  | {
      key: 'second';
      element: ReactElement;
    }
  | {
      key: 'third';
      element: ReactElement;
    };

export const P2pFileDeliveryDialog: FC<{
  mode?: 'sender' | 'receiver';
  id?: string;
  onClose(): void;
}> = ({ id, mode = 'sender', onClose }) => {
  const [state, setState] = useState<{
    receiverId: string | undefined;
    senderId: string | undefined;
    connection: RTCImpl | undefined;
  }>(() => ({
    receiverId: undefined,
    senderId: mode == 'receiver' ? id : undefined,
    connection: undefined,
  }));
  const participantsRef = useLatestRef([state.senderId, state.receiverId]);
  const { data: connections = [], refresh } = useGetSseConnections({
    keepDirtyOnPending: true,
    onBefore: () => notifyManager.ensureWork(),
  });
  const [currentConnection, otherConnections] = useMemo(
    () => [
      connections.find((it) => it.id == notifyManager.clientId),
      connections.filter((it) => it.id != notifyManager.clientId),
    ],
    [connections],
  );
  const handleConnect = useCallback((id: string) => {
    withProduce(setState, (draft) => {
      draft.receiverId = id;
      draft.senderId = notifyManager.clientId!;
    });
  }, []);
  const handleSuccess = useCallback((conn: RTCImpl) => {
    withProduce(setState, (draft) => {
      draft.connection = conn;
    });
  }, []);
  const handleCancel = useCallback(() => {
    if (mode == 'sender') {
      withProduce(setState, (draft) => {
        draft.receiverId = undefined;
        draft.senderId = undefined;
      });
    } else {
      onClose();
    }
  }, [mode, onClose]);
  const handleConnClose = useCallback(
    (code: number, reason: string) => {
      console.log(`connection closed, code: ${code}, reason: ${reason}`);
      if (mode == 'sender') {
        withProduce(setState, (draft) => {
          draft.receiverId = void 0;
          draft.senderId = void 0;
          draft.connection = void 0;
        });
      } else {
        onClose();
      }
    },
    [mode, onClose],
  );
  useEffect(() => {
    notifyManager.disableAutoDisconnect = true;
    return notifyManager.batch(
      notifyManager.on('USER_CONNECTED', () => {
        refresh().catch(console.error);
      }),
      notifyManager.on('USER_DISCONNECTED', (id) => {
        const [senderId, receiverId] = participantsRef.current;
        if (id == senderId) {
          onClose();
          return void 0;
        }
        if (id == receiverId) {
          withProduce(setState, (draft) => {
            draft.connection = void 0;
            draft.receiverId = void 0;
          });
        }
        refresh().catch(console.error);
      }),
      () => void (notifyManager.disableAutoDisconnect = false),
    );
  }, [refresh, mode, participantsRef, onClose]);
  const panel = ((): Panel => {
    if (state.connection)
      return {
        key: 'third',
        element: (
          <P2PFileDelivery conn={state.connection} onClose={handleConnClose} />
        ),
      };
    else if (mode == 'receiver' || state.receiverId)
      return {
        key: 'second',
        element: (
          <P2PConnectControl
            receiverId={state.receiverId}
            mode={mode}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
          />
        ),
      };
    else if (currentConnection)
      return {
        key: 'first',
        element: (
          <Invitations
            currentConnection={currentConnection}
            otherConnections={otherConnections}
            onConnect={handleConnect}
          />
        ),
      };
    else
      return {
        key: 'loading',
        element: (
          <Loading.Wrapper>
            <Loading />
          </Loading.Wrapper>
        ),
      };
  })();
  return (
    <Dialog
      header="Peer to peer file delivery"
      visible={true}
      onHide={onClose}
      className="w-[500px]"
    >
      <AnimatePresence mode="wait">
        <motion.section
          key={panel.key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="w-full min-h-[200px] relative"
        >
          {panel.element}
        </motion.section>
      </AnimatePresence>
    </Dialog>
  );
};

const ConnectionItem: FC<{
  isCurrent: boolean;
  conn: InferResponse<typeof useGetSseConnections>[number];
  onClick(id: string): void;
}> = ({ isCurrent, conn, onClick }) => {
  return (
    <li className="flex gap-2 mt-8 first-of-type:mt-0 justify-between">
      <div>
        <div className="flex">
          <span>{conn.ip_alias || conn.id}</span>
        </div>
        <UserAgent value={conn.user_agent} className="w-[360px] mt-2" />
      </div>
      {!isCurrent && (
        <Button link onClick={() => onClick(conn.id)} size="small">
          {t`connect`}
        </Button>
      )}
    </li>
  );
};

const UserAgent: FC<{
  value: string;
  className?: string;
}> = memo(({ value, className }) => {
  const [ua, icon] = useMemo(() => {
    const ua = getBrowserInfo(value);
    const deviceType = getDeviceType(value);
    switch (deviceType) {
      case 'laptop':
        return [ua, <LaptopIcon className="w-5 h-5" />];
      case 'mobile':
        return [ua, <SmartphoneIcon className="w-5 h-5" />];
      case 'tablet':
        return [ua, <TabletIcon className="w-5 h-5" />];
      case 'unknown':
        return [ua, <PcCaseIcon className="w-5 h-5" />];
    }
  }, [value]);
  return (
    <div className={clsx('flex items-end justify-end gap-2', className)}>
      {icon}
      <span className="flex flex-1 truncate gap-2" title={value}>
        {ua ? (
          <>
            <span>{ua.os}</span>
            <span>{ua.browser}</span>
            {ua.version && <span>{ua.version}</span>}
          </>
        ) : (
          value
        )}
      </span>
    </div>
  );
});

const Invitations: FC<{
  currentConnection: InferResponse<typeof useGetSseConnections>[number];
  otherConnections: InferResponse<typeof useGetSseConnections>;
  onConnect(targetId: string): void;
}> = ({ currentConnection, otherConnections, onConnect }) => {
  const [pin, setPin] = useState<{
    enabled: boolean;
    value: string | undefined;
  }>(() => ({ enabled: false, value: undefined }));
  const onTogglePin = useCallback((evt: InputSwitchChangeEvent) => {
    setPin({ enabled: evt.value, value: undefined });
  }, []);
  const onPinChange = useCallback((evt: InputOtpChangeEvent) => {
    withProduce(
      setPin,
      (draft) => void (draft.value = evt.value ? String(evt.value) : undefined),
    );
  }, []);
  return (
    <section className="w-full">
      <form className="flex flex-col gap-8 w-full">
        <div className="flex items-center justify-between gap-8 w-full">
          <div className="flex-1">
            <label className="font-bold">ID</label>
          </div>
          <span>{currentConnection.id}</span>
        </div>
        <div className="flex items-center justify-between gap-8 w-full">
          <div className="flex-1">
            <label className="font-bold">User agent</label>
          </div>
          <UserAgent value={currentConnection.user_agent} />
        </div>
        <div className="w-full">
          <div className="flex items-center justify-between gap-8">
            <div className="flex-1">
              <label className="font-bold">Peer PIN</label>
              <p className="text-gray-300 mt-1">
                Enabling PIN ensures you won't connect to unknown client. If the
                other party has enabled PIN, you also need to enable it to
                connect.
              </p>
            </div>
            <InputSwitch
              id="pin-switch"
              checked={pin.enabled}
              onChange={onTogglePin}
            />
          </div>
          {pin.enabled && (
            <div className="mt-4">
              <InputOtp value={pin.value} onChange={onPinChange} />
            </div>
          )}
        </div>
      </form>
      <Divider align="center">
        <span>Client</span>
      </Divider>
      <section>
        <ul className="my-2">
          {otherConnections.length > 0 ? (
            otherConnections.map((it) => (
              <ConnectionItem
                key={it.id}
                isCurrent={false}
                conn={it}
                onClick={onConnect}
              />
            ))
          ) : (
            <li className="text-gray-300 py-3 select-none">{t`no data`}</li>
          )}
        </ul>
      </section>
    </section>
  );
};

enum ConnectStatus {
  WaitingForAccptance = 1,
  Connecting,
  TestingAvailability,
  Connected,
  Accepted,
  RejectedByPeer,
  ConnectionTimeout,
}

const P2PConnectControl: FC<{
  receiverId?: string;
  mode: 'sender' | 'receiver';
  onCancel(): void;
  onSuccess(conn: RTCImpl): void;
}> = ({ mode, receiverId, onSuccess, onCancel }) => {
  const [state, setState] = useState<{
    error: Error | undefined;
    status: ConnectStatus;
    protocol: string;
    delay: number;
  }>(() => ({
    error: undefined,
    status:
      mode == 'sender'
        ? ConnectStatus.WaitingForAccptance
        : ConnectStatus.Accepted,
    protocol: 'webrtc',
    delay: 0,
  }));
  const { execute: createP2PRequest } = usePostCreateP2PRequest();
  const { execute: discardP2PRequest } = useDeleteDiscardP2PRequest();

  const statusTexts = useMemo(
    () => ({
      [ConnectStatus.WaitingForAccptance]: '等待对方接受',
      [ConnectStatus.Connecting]: `正在连接中，采用 ${state.protocol}`,
      [ConnectStatus.TestingAvailability]: '测试可用性中',
      [ConnectStatus.Connected]: `已连接，延迟 ${state.delay}ms`,
      [ConnectStatus.Accepted]: '已接受，等待建立连接',
      [ConnectStatus.RejectedByPeer]: '对方已拒绝',
      [ConnectStatus.ConnectionTimeout]: '连接超时',
    }),
    [state.protocol, state.delay],
  );
  useEffect(() => {
    let conn: RTCImpl | undefined = undefined;
    let clientId: string | undefined = undefined;
    let requestId: string | undefined = undefined;
    const createRequest = async (id: string) => {
      try {
        const res = await createP2PRequest({
          client_id: notifyManager.clientId!,
          target_id: id,
          supports_rtc: Reflect.has(window, 'RTCPeerConnection'),
        });
        requestId = res.request_id;
      } catch (e) {
        console.error('Failed to create request', e);
      }
    };
    const testAvailability = async () => {
      if (!conn) return void 0;
      try {
        const delays: number[] = [];
        withProduce(setState, (draft) => {
          draft.status = ConnectStatus.TestingAvailability;
        });
        for (let i = 0; i < 3; i++) {
          const delay = await conn.ping();
          delays.push(delay);
        }
        withProduce(setState, (draft) => {
          draft.delay = Math.ceil(
            delays.reduce((a, b) => a + b, 0) / delays.length,
          );
          draft.status = ConnectStatus.Connected;
        });
        onSuccess(conn);
        // 放在该组件销毁时关闭连接，conn 已经转移处理者
        conn = undefined;
      } catch (e) {
        console.error(e);
        if (e instanceof Error) {
          withProduce(setState, (draft) => {
            draft.error = e;
          });
        }
      }
    };
    if (mode == 'sender') {
      createRequest(receiverId!).catch(console.error);
    }
    return notifyManager.batch(
      notifyManager.on('P2P_EXCHANGE', async (value) => {
        console.log('exchange', value);
        clientId = notifyManager.clientId;
        requestId = value.request_id;
        if (!requestId) throw new Error('Unexpected error, missing requestId');
        withProduce(setState, (draft) => {
          draft.status = ConnectStatus.Connecting;
          draft.protocol = value.protocol;
        });
        switch (value.protocol) {
          case 'webrtc': {
            if (value.participants[0] == clientId) {
              const webrtc = new P2PRtc(requestId, clientId);
              await webrtc.createSender();
              console.log(webrtc);
              conn = webrtc;
            }
            break;
          }
          case 'websocket': {
            const websocket = new P2PSocket(requestId, clientId!);
            console.log(websocket);
            conn = websocket;
          }
        }
        conn?.once('CONNECTION_READY', () => {
          console.log('CONNECTION_READY');
          testAvailability();
        });
      }),
      notifyManager.on('P2P_SIGNALING', async (value) => {
        if (value[0] == 0) {
          if (value[1].type === 'offer') {
            if (!requestId || !clientId) return void 0;
            const webrtc = new P2PRtc(requestId, clientId);
            await webrtc.createReceiver(value[1]);
            conn = webrtc;
            conn.once('CONNECTION_READY', () => {
              console.log('CONNECTION_READY');
              testAvailability();
            });
          } else {
            if (!conn || !(conn instanceof P2PRtc)) return void 0;
            await conn.setAnswer(value[1]);
          }
        } else {
          if (!conn || !(conn instanceof P2PRtc)) return void 0;
          await conn.addIceCandidate(value[1]);
        }
      }),
      notifyManager.on('P2P_REJECT', (id) => {
        console.log('id', id, 'requestId', requestId);
        if (id !== requestId) return void 0;
        withProduce(setState, (draft) => {
          draft.status = ConnectStatus.RejectedByPeer;
        });
      }),
      () => {
        conn?.close();
        // if (requestId && mode == 'sender')
        //   discardP2PRequest({ request_id: requestId }).catch(console.warn);
      },
    );
  }, [createP2PRequest, discardP2PRequest, mode, onSuccess, receiverId]);
  const icon = (() => {
    switch (state.status) {
      case ConnectStatus.RejectedByPeer:
        return <XCircleIcon className="w-[32px] h-[32px] stroke-error-main" />;
      default:
        return (
          <svg
            viewBox="0 0 52 12"
            enableBackground="new 0 0 0 0"
            className="w-[32px] fill-gray-600"
          >
            <circle stroke="none" cx="6" cy="6" r="6">
              <animate
                attributeName="opacity"
                dur="1s"
                values="0;1;0"
                repeatCount="indefinite"
                begin="0.1"
              ></animate>
            </circle>
            <circle stroke="none" cx="26" cy="6" r="6">
              <animate
                attributeName="opacity"
                dur="1s"
                values="0;1;0"
                repeatCount="indefinite"
                begin="0.2"
              ></animate>
            </circle>
            <circle stroke="none" cx="46" cy="6" r="6">
              <animate
                attributeName="opacity"
                dur="1s"
                values="0;1;0"
                repeatCount="indefinite"
                begin="0.3"
              ></animate>
            </circle>
          </svg>
        );
    }
  })();
  return (
    <section className="flex flex-col w-full items-center gap-2 justify-between min-h-[200px]">
      {state.error ? (
        <>
          <p>Error:</p>
          <p>{String(state.error)}</p>
        </>
      ) : (
        <div className="flex flex-col w-full items-center gap-2 my-10">
          {icon}
          <div className="relative text-center mt-10">
            {statusTexts[state.status]}
          </div>
        </div>
      )}
      <Button severity="danger" onClick={onCancel} className="px-3 py-2">
        Cancel
      </Button>
    </section>
  );
};

interface FileMetadata {
  seq: number;
  name: string;
  mtime: number;
  size: number;
  type: string;
  date: number;
}
interface DeliveryFile extends FileMetadata {
  progress: number;
}

const P2PFileDelivery: FC<{
  conn: RTCImpl;
  onClose(code: number, reason: string): void;
}> = ({ conn, onClose }) => {
  const seqRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [deliveryItems, setDeliveryItems] = useState<DeliveryFile[]>([]);
  const sendFile = useCallback(
    async (file: File) => {
      const fileSeq = seqRef.current;
      seqRef.current += 1;
      const fileMetadata: FileMetadata = {
        seq: fileSeq,
        name: file.name,
        mtime: file.lastModified,
        size: file.size,
        type: file.type,
        date: Date.now(),
      };
      withProduce(setDeliveryItems, (draft) => {
        draft.push({
          ...fileMetadata,
          progress: 0,
        });
      });
      conn.send(
        new TextEncoder().encode(JSON.stringify(fileMetadata)),
        PacketFlag.META,
      );
      if (!(await recvACKPacket(conn, fileSeq, 0, 5000))) {
        console.error(new AckTimeoutError(fileSeq, 5000));
        return void 0;
      }
      const total = file.size;
      let transmitted = 0;
      let packetSeq = 0;
      const reader = createLimitedStream(file.stream(), 128 * 1024).getReader();
      const transmissionRate = createTransmissionRateCalculator(
        fileMetadata.date,
      );
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        packetSeq += 1;
        const buf = new ArrayBuffer(value.length + ACK_PACKET_LENGTH);
        createACKPacket(fileSeq, packetSeq, buf);
        new Uint8Array(buf, ACK_PACKET_LENGTH, value.length).set(value);
        const bytes = new Uint8Array(buf);
        let ackReceived = false;
        for (let i = 0; i <= 3; i++) {
          conn.send(bytes);
          if (i > 0)
            console.log(`Attempt ${i}th retransmit packet #${packetSeq}`);
          if (!(await recvACKPacket(conn, fileSeq, packetSeq, 5_000))) {
            continue;
          }
          ackReceived = true;
          break;
        }
        if (!ackReceived) {
          console.log(`Failed to send packet #${packetSeq}`);
          console.error(new AckTimeoutError(packetSeq, 5_000));
          break;
        }
        const packetLength = value.length;
        transmitted += packetLength;
        withProduce(setDeliveryItems, (draft) => {
          const target = draft.find((it) => it.seq == fileSeq);
          if (!target) return void 0;
          target.progress = Math.ceil((transmitted / total) * 100);
        });
        console.log(
          `transmitted: ${formatBytes(transmitted)}/${formatBytes(total)}(${((transmitted / total) * 100).toFixed(2)}); rate: ${formatBytes(transmissionRate(transmitted))}/s; packet #${packetSeq}(${formatBytes(packetLength)})`,
        );
      }
    },
    [conn],
  );
  const onInputChange = useCallback(
    (evt: ChangeEvent<HTMLInputElement>) => {
      const files = evt.target.files;
      if (!files || files.length == 0) return void 0;
      const file = files[0];
      sendFile(file);
    },
    [sendFile],
  );
  const onClickChoose = useCallback(() => {
    inputRef.current?.click();
  }, []);
  const downloadFile = useCallback(
    async (
      stream: ReadableStream<Uint8Array>,
      filename: string,
      type: string,
      lastModified: number,
    ) => {
      console.log(`准备下载文件，name: ${filename}`);
      try {
        const blob = await new Response(stream).blob();
        const file = new File([blob], filename, {
          type,
          lastModified,
        });
        const url = window.URL.createObjectURL(file);
        const a = document.createElement('a');
        console.log(`准备下载文件，url: ${url}`);
        a.href = url;
        a.download = file.name;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } catch (e) {
        console.error(e);
      }
    },
    [],
  );
  useEffect(() => {
    return conn.batch(
      conn.on(PacketFlag.META, (buf) => {
        try {
          const metadata: FileMetadata = JSON.parse(
            new TextDecoder().decode(new Uint8Array(buf)),
          );
          seqRef.current = Math.max(seqRef.current, metadata.seq + 1);
          withProduce(setDeliveryItems, (draft) => {
            draft.push({
              ...metadata,
              progress: 0,
            });
          });
          const fileSeq = metadata.seq;
          const total = metadata.size;
          let received = 0;
          let packetSeq = 0;
          const transmissionRate = createTransmissionRateCalculator(
            metadata.date,
          );
          // 表示已收到 Metadata Packet 数据, packetSeq 为 0
          console.log('fileSeq', fileSeq, 'packetSeq', packetSeq);
          conn.send(createACKPacket(fileSeq, packetSeq), PacketFlag.ACK);
          let receiver: AsyncGenerator<ArrayBuffer> | undefined = undefined;
          const stream = new ReadableStream({
            async start() {
              receiver = await conn.recv();
            },
            async pull(controller) {
              if (!receiver) throw new Error('Unexpected loss of receiver');
              try {
                const { done, value } = await receiver.next();
                if (done) {
                  controller.close();
                  return void 0;
                }
                if (!value) return void 0;
                packetSeq += 1;
                const [_fileSeq, _packetSeq] = parseACKPacket(value);
                // 不是目标文件的 packet, 忽略
                if (_fileSeq !== fileSeq) return void 0;
                if (_packetSeq !== packetSeq) {
                  controller.error(
                    new PacketSequenceError(packetSeq, _packetSeq),
                  );
                  return void 0;
                }
                controller.enqueue(new Uint8Array(value.slice(8)));
                const packetLength = value.byteLength - 8;
                received += packetLength;
                conn.send(createACKPacket(fileSeq, packetSeq), PacketFlag.ACK);
                console.log('发送 ACK', fileSeq, packetSeq);
                withProduce(setDeliveryItems, (draft) => {
                  const target = draft.find((it) => it.seq == fileSeq);
                  if (!target) return void 0;
                  target.progress = Math.ceil((received / total) * 100);
                });
                console.log(
                  `received: ${formatBytes(received)}/${formatBytes(total)}(${((received / total) * 100).toFixed(2)}); rate: ${formatBytes(transmissionRate(received))}/s; packet #${packetSeq}(${formatBytes(packetLength)})`,
                );
                if (received >= total) controller.close();
              } catch (e) {
                controller.error(e);
              }
            },
          });
          downloadFile(stream, metadata.name, metadata.type, metadata.mtime);
        } catch (e) {
          console.error(e);
        }
      }),
      conn.on('CONNECTION_CLOSE', ({ code, reason }) => {
        onClose(code, reason);
      }),
      () => conn.close(),
    );
  }, [conn, downloadFile, onClose]);
  return (
    <section className="flex flex-col w-full items-center gap-2">
      <div
        ref={containerRef}
        className="flex flex-col items-center justify-center border border-dashed border-gray-300 w-full h-[180px] rounded"
      >
        <UploadIcon className="w-10 h-10" />
        <p className="flex items-center gap-1 mt-6">
          <span className="leading-none">Drag and Drop file here or</span>
          <Button
            text
            className="p-0 leading-none underline rounded-none"
            onClick={onClickChoose}
          >
            Choose file
          </Button>
        </p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={onInputChange}
        />
      </div>
      <div className="w-full mt-4">
        <span className="font-bold ml-1">History:</span>
        <ul className="w-full mt-2">
          {deliveryItems.length == 0 ? (
            <li>no history</li>
          ) : (
            deliveryItems.map((it) => (
              <li
                key={it.seq}
                className="flex items-center w-full rounded-xl border border-gray-200 p-2 my-2 relative gap-2"
              >
                <div className="w-[42px] h-[42px] rounded-xl bg-[#fef5eb] text-[#f7921a] flex items-center justify-center">
                  {it.name.split('.').pop()?.toUpperCase() || 'FILE'}
                </div>
                <div className="flex flex-col flex-1 overflow-hidden">
                  <div className="w-full truncate text-lg" title={it.name}>
                    {it.name}
                  </div>
                  <div className="text-sm flex gap-2">
                    <span>{formatBytes(it.size)}</span>
                    <span className="text-gray-400 ">{it.progress}%</span>
                  </div>
                </div>
                <div className="flex w-[10%] justify-end mx-2">
                  <Button className="p-0" disabled>
                    <XIcon className="w-4 h-4" />
                  </Button>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
};

const ACK_PACKET_LENGTH = 8;

/**
 *
 * @param fileSeq 文件序列
 * @param packetSeq 数据包序列
 * @param buf 如果指定，则向目标 buffer 写入
 * @returns
 */
const createACKPacket = (
  fileSeq: number,
  packetSeq: number,
  buf = new ArrayBuffer(ACK_PACKET_LENGTH),
): Uint8Array => {
  const view = new DataView(buf, 0, ACK_PACKET_LENGTH);
  view.setUint32(0, fileSeq, true);
  view.setUint32(4, packetSeq, true);
  return new Uint8Array(buf);
};
const parseACKPacket = (
  buf: ArrayBuffer,
): [fileSeq: number, packetSeq: number] => {
  const view = new DataView(buf, 0, ACK_PACKET_LENGTH);
  const fileSeq = view.getUint32(0, true);
  const packetSeq = view.getUint32(4, true);
  return [fileSeq, packetSeq];
};
const recvACKPacket = (
  conn: RTCImpl,
  exceptedFileSeq: number,
  exceptedPacketSeq: number,
  timeout = 5000,
) => {
  return new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => {
      off();
      resolve(false);
    }, timeout);
    const off = conn.once(PacketFlag.ACK, (buf) => {
      const [fileSeq, packetSeq] = parseACKPacket(buf);
      if (fileSeq !== exceptedFileSeq || packetSeq !== exceptedPacketSeq)
        return void 0;
      window.clearTimeout(timer);
      resolve(true);
    });
  });
};

class PacketSequenceError extends Error {
  constructor(
    readonly expected: number,
    readonly received: number,
  ) {
    super(
      `Packet sequence mismatch: expected ${expected}, received ${received}`,
    );
    this.name = 'PacketSequenceError';
  }
}
class AckTimeoutError extends Error {
  constructor(
    readonly sequenceNumber: number,
    readonly timeout: number,
  ) {
    super(
      `ACK not received within ${timeout} ms for sequence number ${sequenceNumber}`,
    );
    this.name = 'AckTimeoutError';
  }
}

const createLimitedStream = (
  source: ReadableStream<Uint8Array>,
  chunkSize: number,
): ReadableStream<Uint8Array> => {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let buffer = new Uint8Array(0);
  return new ReadableStream({
    start() {
      reader = source.getReader();
    },
    async pull(controller) {
      if (!reader) throw new Error('Unexpected loss of reader');
      try {
        while (buffer.byteLength < chunkSize) {
          const { done, value } = await reader.read();
          if (done) {
            if (buffer.byteLength > 0) {
              controller.enqueue(buffer);
            }
            controller.close();
            return void 0;
          }
          if (!value) return void 0;
          // 将新读取的数据附加到 buffer
          const tempBuffer = new Uint8Array(
            buffer.byteLength + value.byteLength,
          );
          tempBuffer.set(buffer);
          tempBuffer.set(value, buffer.byteLength);
          buffer = tempBuffer;
        }
        controller.enqueue(buffer.subarray(0, chunkSize));
        buffer = buffer.subarray(chunkSize);
      } catch (error) {
        controller.error(error);
      }
    },
    cancel() {
      reader?.releaseLock();
    },
  });
};
