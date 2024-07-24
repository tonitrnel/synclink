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
import { InputOtp, InputOtpChangeEvent } from 'primereact/inputotp';
import { getBrowserInfo, getDeviceType } from '~/utils/get-device-type.ts';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  KeyIcon,
  LaptopIcon,
  LoaderCircleIcon,
  PcCaseIcon,
  SmartphoneIcon,
  TabletIcon,
  UploadIcon,
  XCircleIcon,
} from 'icons';
import { Button } from 'primereact/button';
import { Loading } from '~/components/loading';
import { t } from '@lingui/macro';
import { withProduce } from '~/utils/with-produce';
import { clsx } from '~/utils/clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { formatBytes } from '~/utils/format-bytes';
import { useConstant, useLatestRef } from '@painted/shared';
import {
  createRemainingTimeCalculator,
  createTransmissionRateCalculator,
} from '~/utils/transmission-rate-calculator';
import { formatSeconds } from '~/utils/format-time';
import { Dropdown } from 'primereact/dropdown';
import { useSnackbar } from '../snackbar';

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

export const P2pFileTransferDialog: FC<{
  mode?: 'sender' | 'receiver';
  id?: string;
  onClose(): void;
}> = ({ id, mode = 'sender', onClose }) => {
  const [state, setState] = useState<{
    receiverId: string | undefined;
    senderId: string | undefined;
    connection: RTCImpl | undefined;
    protocol?: ProtocolPriority;
  }>(() => ({
    receiverId: undefined,
    senderId: mode == 'receiver' ? id : undefined,
    connection: undefined,
    protocol: undefined,
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
  const handleConnect = useCallback(
    (id: string, protocol?: ProtocolPriority) => {
      withProduce(setState, (draft) => {
        draft.receiverId = id;
        draft.senderId = notifyManager.clientId!;
        draft.protocol = protocol;
      });
    },
    [],
  );
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
    notifyManager.keepConnection = true;
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
      () => void (notifyManager.keepConnection = false),
    );
  }, [refresh, mode, participantsRef, onClose]);
  const panel = ((): Panel => {
    if (state.connection)
      return {
        key: 'third',
        element: (
          <FileSelection conn={state.connection} onClose={handleConnClose} />
        ),
      };
    else if (mode == 'receiver' || state.receiverId)
      return {
        key: 'second',
        element: (
          <ConnectionStatus
            receiverId={state.receiverId}
            mode={mode}
            protocol={state.protocol}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
          />
        ),
      };
    else if (currentConnection)
      return {
        key: 'first',
        element: (
          <ClientSetup
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
      header={`Peer to peer file transfer`}
      visible={true}
      onHide={onClose}
      className="w-[500px]"
      id="p2p-file-transfer-dialog"
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
        <Button link onClick={() => onClick(conn.id)} className="px-3 py-2 m-1">
          {t`Connect`}
        </Button>
      )}
    </li>
  );
};

type ProtocolPriority = 'webrtc' | 'websocket';

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

const ClientSetup: FC<{
  currentConnection: InferResponse<typeof useGetSseConnections>[number];
  otherConnections: InferResponse<typeof useGetSseConnections>;
  onConnect(targetId: string, protocol?: ProtocolPriority): void;
}> = ({ currentConnection, otherConnections, onConnect }) => {
  const [state, setState] = useState<{
    pin: string[] | undefined;
    protocol: 'auto' | ProtocolPriority;
  }>(() => ({
    pin: notifyManager.clientPin?.split(''),
    protocol: 'auto',
  }));
  const protocolRef = useLatestRef(state.protocol);
  const protocolOptions = useMemo(
    () => [
      { label: t`Auto`, value: 'auto' },
      { label: 'WebRTC', value: 'webrtc' },
      { label: 'WebSocket', value: 'websocket' },
    ],
    [],
  );
  const handleConnect = useCallback(
    (id: string) => {
      const protocol = protocolRef.current;
      onConnect(id, protocol == 'auto' ? undefined : protocol);
    },
    [onConnect, protocolRef],
  );
  return (
    <section className="w-full">
      <form className="flex flex-col gap-6 w-full">
        <div className="flex items-center justify-between gap-8 w-full">
          <div className="flex-1">
            <label className="font-bold">ID</label>
          </div>
          <span>{currentConnection.id}</span>
        </div>
        <div className="flex items-center justify-between gap-8 w-full">
          <div className="flex-1">
            <label className="font-bold">{t`User agent`}</label>
          </div>
          <UserAgent value={currentConnection.user_agent} />
        </div>
        <div className="flex items-center justify-between gap-8 w-full">
          <div className="flex-1">
            <label className="font-bold">{t`Protocol`}</label>
          </div>
          <Dropdown
            value={state.protocol}
            onChange={(evt) =>
              withProduce(
                setState,
                (draft) => void (draft.protocol = evt.value),
              )
            }
            options={protocolOptions}
            optionLabel="label"
          />
        </div>
        <div className="w-full">
          <div className="flex items-center justify-between gap-8">
            <div className="flex-1">
              <label className="font-bold">{t`Peer PIN`}</label>
            </div>
            <div className="font-mono">
              {state.pin?.map((it, i) => (
                <span key={`${i}${it}`} className="text-gray-500">
                  {it}
                </span>
              )) ?? <span className="text-gray-400">{'<unset>'}</span>}
            </div>
          </div>
        </div>
      </form>
      <Divider align="center">
        <span>{t`Client`}</span>
      </Divider>
      <section>
        <ul className="my-2 max-h-[120px] overflow-y-auto">
          {otherConnections.length > 0 ? (
            otherConnections.map((it) => (
              <ConnectionItem
                key={it.id}
                isCurrent={false}
                conn={it}
                onClick={handleConnect}
              />
            ))
          ) : (
            <li className="text-gray-300 py-3 select-none">{t`No data`}</li>
          )}
        </ul>
      </section>
    </section>
  );
};

enum ConnectStatus {
  WaitingForAcceptance = 1,
  Connecting,
  TestingAvailability,
  Connected,
  Accepted,
  RejectedByPeer,
  ConnectionTimeout,
  WaitingForKeyInput,
}

const ConnectionStatus: FC<{
  receiverId?: string;
  mode: 'sender' | 'receiver';
  protocol?: ProtocolPriority;
  onCancel(): void;
  onSuccess(conn: RTCImpl, delay: number): void;
}> = ({ mode, protocol, receiverId, onSuccess, onCancel }) => {
  const [state, setState] = useState<{
    error: Error | undefined;
    status: ConnectStatus;
    protocol: string;
    delay: number;
    requirePin: boolean;
    pin: string;
  }>(() => ({
    error: undefined,
    status:
      mode == 'sender'
        ? notifyManager.clientPin !== undefined
          ? ConnectStatus.WaitingForKeyInput
          : ConnectStatus.WaitingForAcceptance
        : ConnectStatus.Accepted,
    protocol: 'webrtc',
    delay: 0,
    requirePin: notifyManager.clientPin !== undefined,
    pin: '',
  }));
  const metadata = useConstant<{
    requestId: string | undefined;
    clientId: string | undefined;
  }>(() => ({
    requestId: undefined,
    clientId: undefined,
  }));
  const { execute: createP2PRequest, pending: creating } =
    usePostCreateP2PRequest();
  const { execute: discardP2PRequest } = useDeleteDiscardP2PRequest();
  const snackbar = useSnackbar();

  const statusTexts = useMemo(
    () => ({
      [ConnectStatus.WaitingForAcceptance]: '等待对方接受',
      [ConnectStatus.Connecting]: `正在连接中，采用 ${state.protocol}`,
      [ConnectStatus.TestingAvailability]: '测试可用性中',
      [ConnectStatus.Connected]: `已连接，延迟 ${state.delay}ms`,
      [ConnectStatus.Accepted]: '已接受，等待建立连接',
      [ConnectStatus.RejectedByPeer]: '对方已拒绝',
      [ConnectStatus.ConnectionTimeout]: '连接超时',
      [ConnectStatus.WaitingForKeyInput]: '请输入连接密钥',
    }),
    [state.protocol, state.delay],
  );

  const createRequest = useCallback(
    async (id: string, target_pin?: string): Promise<boolean> => {
      try {
        const res = await createP2PRequest({
          client_id: notifyManager.clientId!,
          target_id: id,
          supports_rtc: Reflect.has(window, 'RTCPeerConnection'),
          target_pin,
        });
        metadata.requestId = res.request_id;
        return true;
      } catch (e) {
        console.error('Failed to create request', e);
        if (e instanceof Error) {
          snackbar.enqueueSnackbar({
            variant: 'error',
            message: e.message,
          });
        }
        return false;
      }
    },
    [createP2PRequest, metadata, snackbar],
  );

  const discardRequest = useCallback(
    (requestId: string) => {
      discardP2PRequest({ request_id: requestId }).catch(console.warn);
    },
    [discardP2PRequest],
  );
  const handleChangePin = useCallback((evt: InputOtpChangeEvent) => {
    withProduce(setState, (draft) => {
      draft.pin = evt.value?.toString() || '';
    });
  }, []);
  useEffect(() => {
    let conn: RTCImpl | undefined = undefined;

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
        const delay = Math.ceil(
          delays.reduce((a, b) => a + b, 0) / delays.length,
        );
        withProduce(setState, (draft) => {
          draft.delay = delay;
          draft.status = ConnectStatus.Connected;
        });
        onSuccess(conn, delay);
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
    if (mode == 'sender' && !state.requirePin) {
      createRequest(receiverId!).catch(console.error);
    }
    if (mode == 'sender' && state.requirePin) {
      const input = document.querySelector<HTMLInputElement>(
        'div#pin-input input',
      );
      if (input) setTimeout(() => input.focus());
    }
    return notifyManager.batch(
      notifyManager.on('P2P_EXCHANGE', async (value) => {
        // console.log('exchange', value);
        metadata.clientId = notifyManager.clientId;
        metadata.requestId = value.request_id;
        if (!metadata.requestId)
          throw new Error('Unexpected error, missing requestId');
        withProduce(setState, (draft) => {
          draft.status = ConnectStatus.Connecting;
          draft.protocol = value.protocol;
        });
        switch (protocol || value.protocol) {
          case 'webrtc': {
            if (value.participants[0] == metadata.clientId) {
              const webrtc = new P2PRtc(metadata.requestId, metadata.clientId);
              await webrtc.createSender();
              // console.log(webrtc);
              conn = webrtc;
            }
            break;
          }
          case 'websocket': {
            const websocket = new P2PSocket(
              metadata.requestId,
              metadata.clientId!,
            );
            // console.log(websocket);
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
            if (!metadata.requestId || !metadata.clientId) return void 0;
            const webrtc = new P2PRtc(metadata.requestId, metadata.clientId);
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
        console.log('id', id, 'requestId', metadata.requestId);
        if (id !== metadata.requestId) return void 0;
        withProduce(setState, (draft) => {
          draft.status = ConnectStatus.RejectedByPeer;
        });
      }),
      () => {
        conn?.close();
        if (metadata.requestId && mode == 'sender' && !conn)
          discardRequest(metadata.requestId);
      },
    );
  }, [
    createRequest,
    discardRequest,
    metadata,
    mode,
    onSuccess,
    protocol,
    receiverId,
    snackbar,
    state.requirePin,
  ]);
  useEffect(() => {
    if (state.pin.length != 6 || !receiverId) return void 0;
    createRequest(receiverId, state.pin).then((success) => {
      if (success) {
        withProduce(setState, (draft) => {
          draft.status = ConnectStatus.WaitingForAcceptance;
        });
      }
    });
  }, [createRequest, receiverId, state.pin]);
  const icon = (() => {
    switch (state.status) {
      case ConnectStatus.RejectedByPeer:
        return <XCircleIcon className="w-[32px] h-[32px] stroke-error-main" />;
      case ConnectStatus.WaitingForKeyInput:
        return <KeyIcon className="w-[24px] h-[24px] -mt-4" />;
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
          {state.status == ConnectStatus.WaitingForKeyInput && (
            <div id="pin-input" className="mt-6">
              <InputOtp
                length={6}
                disabled={creating}
                value={state.pin}
                onChange={handleChangePin}
              />
            </div>
          )}
        </div>
      )}
      <Button severity="danger" onClick={onCancel} className="px-3 py-2">
        {t`cancel`}
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
  transmitted: number;
  eta: number;
  rate: number;
  aborted: boolean;
}

const FileSelection: FC<{
  conn: RTCImpl;
  onClose(code: number, reason: string): void;
}> = ({ conn, onClose }) => {
  const seqRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [deliveryItems, setDeliveryItems] = useState<DeliveryFile[]>([]);
  const [rtt, setRTT] = useState(() => conn.rtt);
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
          transmitted: 0,
          eta: Infinity,
          rate: 0,
          aborted: false,
        });
      });
      try {
        conn.send(
          new TextEncoder().encode(JSON.stringify(fileMetadata)),
          PacketFlag.META,
        );
        if (!(await recvACKPacket(conn, fileSeq, 0, 5_000))) {
          console.error(new AckTimeoutError(fileSeq, 5_000));
          return void 0;
        }
        const total = file.size;
        let transmitted = 0;
        let packetSeq = 0;
        let previousUpdateTime = Date.now();
        const reader =
          conn.protocol === 'webrtc'
            ? createLimitedStream(
                file.stream(),
                (conn as P2PRtc).MAC_PACKET_SIZE,
              ).getReader()
            : file.stream().getReader();
        const getTransmissionRate = createTransmissionRateCalculator(
          fileMetadata.date,
        );
        const getRemainingTime = createRemainingTimeCalculator(
          fileMetadata.size,
        );
        const enableAck = conn.protocol === 'webrtc';
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            withProduce(setDeliveryItems, (draft) => {
              const target = draft.find((it) => it.seq == fileSeq);
              if (!target) return void 0;
              target.eta = 0;
              target.transmitted = target.size;
              target.progress = 100;
              target.rate = getTransmissionRate(target.size);
            });
            break;
          }
          if (!value) continue;
          packetSeq += 1;
          const buf = new ArrayBuffer(value.length + ACK_PACKET_LENGTH);
          createACKPacket(fileSeq, packetSeq, buf);
          new Uint8Array(buf, ACK_PACKET_LENGTH, value.length).set(value);
          const bytes = new Uint8Array(buf);
          if (enableAck) {
            let ackReceived = false;
            for (let i = 0; i <= 3; i++) {
              await conn.waitForDrain();
              if (i > 0) {
                console.log(
                  `发送 packet #${fileSeq}_${packetSeq} 失败，Attempt ${i}th retransmit`,
                );
              }
              conn.send(bytes);
              if (!(await recvACKPacket(conn, fileSeq, packetSeq, 5_000))) {
                continue;
              }
              // console.log(`发送 PACKET #${fileSeq}_${packetSeq} success!`);
              ackReceived = true;
              break;
            }
            if (!ackReceived) {
              console.warn(
                `Failed to send packet #${fileSeq}_${packetSeq}; exited!`,
              );
              withProduce(setDeliveryItems, (draft) => {
                const target = draft.find((it) => it.seq == fileSeq);
                if (!target) return void 0;
                target.aborted = true;
              });
              // console.error(new AckTimeoutError(packetSeq, 5_000));
              break;
            }
          } else {
            await conn.waitForDrain();
            conn.send(bytes);
          }
          const packetLength = value.length;
          transmitted += packetLength;
          const currentTime = Date.now();
          const eta = getRemainingTime(transmitted, currentTime);
          const rate = getTransmissionRate(transmitted, currentTime);
          // 限制 UI 刷新频率
          if (currentTime - previousUpdateTime > 1000) {
            previousUpdateTime = currentTime;
            withProduce(setDeliveryItems, (draft) => {
              const target = draft.find((it) => it.seq == fileSeq);
              if (!target) return void 0;
              target.progress = Math.ceil((transmitted / total) * 100);
              target.transmitted = transmitted;
              target.eta = eta;
              target.rate = rate;
            });
          }
          // console.log(
          //   `transmitted: ${formatBytes(transmitted)}/${formatBytes(total)}(${((transmitted / total) * 100).toFixed(2)}); rate: ${formatBytes(rate)}/s; eta: ${formatSeconds(eta)}; packet #${packetSeq}(${formatBytes(packetLength)})`,
          // );
        }
      } catch (e) {
        console.error(e);
        withProduce(setDeliveryItems, (draft) => {
          const target = draft.find((it) => it.seq == fileSeq);
          if (!target) return void 0;
          target.aborted = true;
        });
      }
    },
    [conn],
  );
  const onInputChange = useCallback(
    (evt: ChangeEvent<HTMLInputElement>) => {
      const files = evt.target.files;
      if (!files || files.length == 0) return void 0;
      for (const file of files) {
        sendFile(file);
      }
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
        const file = new File([await streamToBlob(stream, type)], filename, {
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
              transmitted: 0,
              eta: Infinity,
              rate: 0,
              aborted: false,
            });
          });
          const fileSeq = metadata.seq;
          const total = metadata.size;
          let received = 0;
          let packetSeq = 0;
          let previousUpdateTime = Date.now();
          const getTransmissionRate = createTransmissionRateCalculator(
            metadata.date,
          );
          const getRemainingTime = createRemainingTimeCalculator(metadata.size);
          const markFileAsAborted = () => {
            withProduce(setDeliveryItems, (draft) => {
              const target = draft.find((it) => it.seq == fileSeq);
              if (!target) return void 0;
              target.aborted = true;
            });
          };
          const updateProgress = () => {
            const currentTime = Date.now();
            const rate = getTransmissionRate(received, currentTime);
            const eta = getRemainingTime(received, currentTime);

            // 限制 UI 刷新频率
            if (currentTime - previousUpdateTime > 1000) {
              previousUpdateTime = currentTime;
              withProduce(setDeliveryItems, (draft) => {
                const target = draft.find((it) => it.seq == fileSeq);
                if (!target) return;
                target.progress = Math.ceil((received / total) * 100);
                target.transmitted = received;
                target.eta = eta;
                target.rate = rate;
              });
            }
          };
          const finalizeTransfer = () => {
            const currentTime = Date.now();
            const rate = getTransmissionRate(received, currentTime);
            const eta = getRemainingTime(received, currentTime);

            withProduce(setDeliveryItems, (draft) => {
              const target = draft.find((it) => it.seq == fileSeq);
              if (!target) return;
              target.eta = eta;
              target.rate = rate;
              target.transmitted = target.size;
              target.progress = 100;
            });

            receiver!.return();
          };
          const enableAck = conn.protocol === 'webrtc';

          // 表示已收到 Metadata Packet 数据, packetSeq 为 0
          // console.log('fileSeq', fileSeq, 'packetSeq', packetSeq);
          conn.send(createACKPacket(fileSeq, packetSeq), PacketFlag.ACK);
          let receiver: AsyncGenerator<ArrayBuffer, void> | undefined =
            undefined;
          const stream = new ReadableStream({
            async start() {
              receiver = await conn.recv();
            },
            async pull(controller) {
              // console.log('start pull', fileSeq, packetSeq + 1);
              if (!receiver) throw new Error('Unexpected loss of receiver');
              try {
                let packet: ArrayBuffer | undefined,
                  _packetSeq: number | undefined;
                // 如果多文件同时传输，receiver 会接收到其他文件的 packet，因此需要循环直到找到符合的 packet
                while (packet === undefined || _packetSeq === undefined) {
                  const { done, value } = await receiver.next();
                  if (done) {
                    markFileAsAborted();
                    controller.error(
                      new StreamAbnormalTerminationError(total, received),
                    );
                    return void 0;
                  }
                  if (!value) continue;
                  const [_fileSeq, _packetSeq2] = parseACKPacket(value);
                  // console.log(
                  //   'pull success',
                  //   `excepted: ${fileSeq}_${packetSeq + 1}`,
                  //   'done',
                  //   done,
                  //   value?.byteLength || 'empty',
                  //   `[${_fileSeq}_${_packetSeq}]`,
                  // );

                  // Ignore packet from non-target file
                  if (_fileSeq !== fileSeq) continue;
                  _packetSeq = _packetSeq2;
                  packet = value;
                  break;
                }

                // 顺序错乱，结束并标记文件传输异常中止
                if (_packetSeq !== packetSeq + 1) {
                  markFileAsAborted();
                  controller.error(
                    new PacketSequenceError(packetSeq + 1, _packetSeq),
                  );
                  receiver.return();
                  return void 0;
                }

                // 推入 packet 至文件流
                // console.log('接收 PACKET', fileSeq, _packetSeq);
                packetSeq = _packetSeq;
                controller.enqueue(new Uint8Array(packet.slice(8)));

                // 发送 ACK
                const packetLength = packet.byteLength - 8;
                received += packetLength;
                if (enableAck) {
                  // await conn.waitForDrain();
                  conn.send(
                    createACKPacket(fileSeq, _packetSeq),
                    PacketFlag.ACK,
                  );
                  // console.log('发送 ACK', fileSeq, _packetSeq);
                }

                // 刷新 UI
                if (received >= total) {
                  finalizeTransfer();
                  controller.close();
                } else {
                  updateProgress();
                }
              } catch (e) {
                markFileAsAborted();
                receiver.return();
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
      conn.on('RTT_CHANGE', (rtt) => setRTT(rtt)),
      () => conn.close(),
    );
  }, [conn, downloadFile, onClose]);
  return (
    <section className="flex flex-col w-full items-center gap-2">
      <p className="w-full flex text-left gap-1">
        <span>
          {t`Protocol`}: {conn.protocol}
        </span>
        <span>
          {t`RTT`}: {rtt}ms
        </span>
      </p>
      <div
        ref={containerRef}
        className="flex flex-col items-center justify-center border border-dashed border-gray-300 w-full h-[180px] rounded"
      >
        <UploadIcon className="w-10 h-10" />
        <p className="flex items-center gap-1 mt-6">
          <span className="leading-none">{t`Drag and Drop file here or`}</span>
          <Button
            text
            className="p-0 leading-none underline rounded-none"
            onClick={onClickChoose}
          >
            {t`Choose file`}
          </Button>
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onInputChange}
        />
      </div>
      <div className="w-full mt-4">
        <span className="font-bold ml-1">{t`History:`}</span>
        <ul className="w-full mt-2  max-h-[120px] overflow-y-auto">
          {deliveryItems.length == 0 ? (
            <li className="text-gray-300 mt-2 ml-1">{t`No data`}</li>
          ) : (
            deliveryItems.map((it) => (
              <li
                key={it.seq}
                className="flex items-center w-full border-b border-gray-100 p-2 my-2 relative gap-2"
              >
                <div className="flex flex-col flex-1 overflow-hidden">
                  <div
                    className="w-full truncate leading-relaxed"
                    title={it.name}
                  >
                    {it.name}
                  </div>
                  <div className="flex gap-2 font-mono">
                    <span>
                      {it.progress}% ({formatBytes(it.transmitted)} /{' '}
                      {formatBytes(it.size)})
                    </span>
                    <span className="ml-1">
                      [{formatBytes(it.rate)}/s] ETA: {formatSeconds(it.eta)}
                    </span>
                  </div>
                </div>
                <div className="flex justify-end mx-2">
                  {it.progress === 100 ? (
                    <CheckCircleIcon className="w-4 h-4" />
                  ) : it.aborted ? (
                    <AlertCircleIcon className="w-4 h-4 stroke-error-main" />
                  ) : (
                    <LoaderCircleIcon className="w-4 h-4 animate-spin" />
                  )}
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
  fileSeq: number,
  packetSeq: number,
  timeout = 5_000,
) => {
  return new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => {
      release();
      resolve(false);
    }, timeout);
    const release = conn.on(PacketFlag.ACK, (buf) => {
      const [_fileSeq, _packetSeq] = parseACKPacket(buf);
      if (fileSeq !== _fileSeq) return void 0;
      window.clearTimeout(timer);
      resolve(packetSeq === _packetSeq);
      release();
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

class StreamAbnormalTerminationError extends Error {
  constructor(
    readonly expectedBytes: number,
    readonly receivedBytes: number,
  ) {
    super(
      `Stream terminated abnormally: expected ${expectedBytes} bytes, but received ${receivedBytes} bytes.`,
    );
    this.name = 'StreamAbnormalTerminationError';
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

const streamToBlob = async (
  stream: ReadableStream<Uint8Array>,
  type: string,
): Promise<Blob> => {
  // const reader = stream.getReader();
  // const pumpedStream = new ReadableStream({
  //   start(controller) {
  //     return pump();
  //     /**
  //      * Recursively pumps data chunks out of the `ReadableStream`.
  //      * @type { () => Promise<void> }
  //      */
  //     async function pump(): Promise<void> {
  //       return reader.read().then(({ done, value }) => {
  //         if (done) {
  //           controller.close();
  //           return;
  //         }
  //         controller.enqueue(value);
  //         return pump();
  //       });
  //     }
  //   },
  // });

  const res = new Response(stream);
  const blob = await res.blob();
  // reader.releaseLock();
  return new Blob([blob], { type });
};
