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
  useDiscardP2PMutation,
  useSSEConnectionsQuery,
  useCreateP2PMutation,
} from '~/endpoints';
import { notifyManager } from '~/utils/notify-manager.ts';
import { P2PRtc, P2PSocket, PacketFlag, RTCImpl } from '~/utils/p2p.ts';
import { getBrowserInfo, getDeviceType } from '~/utils/get-device-type.ts';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  CircleXIcon,
  KeyIcon,
  LaptopIcon,
  LoaderCircleIcon,
  PcCaseIcon,
  SmartphoneIcon,
  TabletIcon,
  UploadIcon,
  XCircleIcon,
} from 'lucide-react';
import { Loading } from '~/components/loading';
import { withProduce } from '~/utils/with-produce';
import { clsx } from '~/utils/clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { formatBytes } from '~/utils/format-bytes';
import { useLatestRef } from '@ptdgrp/shared-react';
import {
  createRemainingTimeCalculator,
  createTransmissionRateCalculator,
} from '~/utils/transmission-rate-calculator';
import { formatSeconds } from '~/utils/format-time';
import { useSnackbar } from '../ui/snackbar';
import { useLingui } from '@lingui/react';
import { Dialog } from '../ui/dialog';
import { Divider } from '../ui/divider';
import { Select } from '../ui/select';
import { Button } from '../ui/button';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '../ui/input-opt';
import { t } from '@lingui/macro';

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
}> = ({ id, mode, onClose }) => {
  const i18n = useLingui();
  return (
    <Dialog
      id="p2p-file-transfer-dialog"
      visible={true}
      onClose={onClose}
      className="w-[40rem]"
    >
      <Dialog.Header>
        <Dialog.Title>{i18n._('Peer to peer file transfer')}</Dialog.Title>
        <Dialog.Description className="sr-only">
          {i18n._('Quickly share files with other client who open this page')}
        </Dialog.Description>
      </Dialog.Header>
      <Dialog.Content>
        <FileTransferImpl id={id} mode={mode} onClose={onClose} isDialog />
      </Dialog.Content>
    </Dialog>
  );
};

export const FileTransferImpl: FC<{
  mode?: 'sender' | 'receiver';
  id?: string;
  onClose?(): void;
  isDialog?: boolean;
}> = ({ id, mode = 'sender', isDialog = false, onClose }) => {
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
  const connRef = useLatestRef(state.connection);
  const participantsRef = useLatestRef([state.senderId, state.receiverId]);
  const { data: connections = [], refresh } = useSSEConnectionsQuery({
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
        onClose?.();
      }
    },
    [mode, onClose],
  );

  const handleCancel = useCallback(() => {
    if (mode == 'sender') {
      withProduce(setState, (draft) => {
        draft.receiverId = undefined;
        draft.senderId = undefined;
      });
    } else {
      onClose?.();
    }
  }, [mode, onClose]);

  useEffect(() => {
    notifyManager.keepConnection = true;
    return notifyManager.batch(
      notifyManager.on('USER_CONNECTED', () => {
        refresh().catch(console.error);
      }),
      notifyManager.on('USER_DISCONNECTED', (id) => {
        const [senderId, receiverId] = participantsRef.current;
        if (id == senderId) {
          onClose?.();
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
      () => void connRef.current?.close(),
    );
  }, [refresh, mode, participantsRef, onClose, connRef]);

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
          <ConnectionControl
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
            isDialog={isDialog}
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
    <AnimatePresence mode="wait">
      <motion.section
        key={panel.key}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="relative min-h-[16rem] w-full"
      >
        {panel.element}
      </motion.section>
    </AnimatePresence>
  );
};

const ClientItem: FC<{
  isDialog: boolean;
  isCurrent: boolean;
  conn: InferResponse<typeof useSSEConnectionsQuery>[number];
  onClick(id: string): void;
}> = ({ isCurrent, isDialog, conn, onClick }) => {
  const i18n = useLingui();
  return (
    <li className={clsx('mt-8 flex justify-between gap-2 first-of-type:mt-0')}>
      <div>
        <div className="flex">
          <span>{conn.ip_alias || conn.id}</span>
        </div>
        <UserAgent
          value={conn.user_agent}
          className={clsx('mt-2 truncate', isDialog ? 'w-[30rem]' : 'w-full')}
        />
      </div>
      {!isCurrent && (
        <Button
          variant={isDialog ? 'ghost' : 'outline'}
          onClick={() => onClick(conn.id)}
          className="m-1 px-3 py-2"
        >
          {i18n._('Connect')}
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
      case 'desktop':
        return [ua, <LaptopIcon className="h-4 w-4" />];
      case 'mobile':
        return [ua, <SmartphoneIcon className="h-4 w-4" />];
      case 'tablet':
        return [ua, <TabletIcon className="h-4 w-4" />];
      case 'unknown':
        return [ua, <PcCaseIcon className="h-4 w-4" />];
    }
  }, [value]);
  return (
    <div className={clsx('flex items-center justify-end gap-2', className)}>
      {icon}
      <span className="flex flex-1 gap-2 truncate" title={value}>
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
  isDialog: boolean;
  currentConnection: InferResponse<typeof useSSEConnectionsQuery>[number];
  otherConnections: InferResponse<typeof useSSEConnectionsQuery>;
  onConnect(targetId: string, protocol?: ProtocolPriority): void;
}> = ({ currentConnection, otherConnections, onConnect, isDialog }) => {
  const [state, setState] = useState<{
    pin: string[] | undefined;
    protocol: 'auto' | ProtocolPriority;
  }>(() => ({
    pin: notifyManager.clientPin?.split(''),
    protocol: 'auto',
  }));
  const i18n = useLingui();
  const protocolRef = useLatestRef(state.protocol);
  const protocolOptions = useMemo(
    () => [
      { label: i18n._('Auto'), value: 'auto' },
      { label: 'WebRTC', value: 'webrtc' },
      { label: 'WebSocket', value: 'websocket' },
    ],
    [i18n],
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
      <form className="flex w-full flex-col gap-6 text-sm">
        <div className="flex w-full items-center justify-between gap-8">
          <div className="flex-1">
            <label className="font-bold">ID</label>
          </div>
          <span>{currentConnection.id}</span>
        </div>
        <div className="flex w-full items-center justify-between gap-8">
          <div className="flex-1">
            <label className="font-bold">{i18n._(`User agent`)}</label>
          </div>
          <UserAgent value={currentConnection.user_agent} />
        </div>
        <div className="flex w-full items-center justify-between gap-8">
          <div className="flex-1">
            <label className="font-bold">{i18n._('Protocol')}</label>
          </div>
          <Select
            value={state.protocol}
            onValueChange={(value) =>
              withProduce(
                setState,
                (draft) => void (draft.protocol = value as ProtocolPriority),
              )
            }
          >
            <Select.Trigger className="w-[8rem]">
              <Select.Value placeholder={i18n._('Select a protocol')} />
            </Select.Trigger>
            <Select.Content>
              {protocolOptions.map((it) => (
                <Select.Item key={it.value} value={it.value}>
                  {it.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
        <div className="w-full">
          <div className="flex items-center justify-between gap-8">
            <div className="flex-1">
              <label className="font-bold">{i18n._('Peer PIN')}</label>
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
      <Divider align="center" className="text-sm">
        <span>{i18n._('Client')}</span>
      </Divider>
      <section>
        <ul className="my-2 max-h-[18rem] overflow-y-auto text-sm">
          {otherConnections.length > 0 ? (
            otherConnections.map((it) => (
              <ClientItem
                key={it.id}
                isCurrent={false}
                isDialog={isDialog}
                conn={it}
                onClick={handleConnect}
              />
            ))
          ) : (
            <li className="select-none py-3 text-gray-300">
              {i18n._('No data')}
            </li>
          )}
        </ul>
      </section>
    </section>
  );
};

enum ConnectionStatus {
  WaitingForAcceptance = 1,
  WaitingForKeyInput = 2,
  Accepted = 3,
  Connecting,
  TestingAvailability,
  Connected,
  RejectedByPeer,
  ConnectionTimeout,
}

const ConnectionControl: FC<{
  receiverId?: string;
  mode: 'sender' | 'receiver';
  protocol?: ProtocolPriority;
  onCancel(): void;
  onSuccess(conn: RTCImpl, delay: number): void;
}> = ({
  mode,
  protocol: protocolPriority,
  receiverId,
  onSuccess,
  onCancel,
}) => {
  const [state, setState] = useState<{
    error: Error | undefined;
    status: ConnectionStatus;
    protocol: string;
    delay: number;
    requirePin: boolean;
    pin: string;
  }>(() => ({
    error: undefined,
    status:
      mode == 'sender'
        ? notifyManager.clientPin !== undefined
          ? ConnectionStatus.WaitingForKeyInput
          : ConnectionStatus.WaitingForAcceptance
        : ConnectionStatus.Accepted,
    protocol: 'webrtc',
    delay: 0,
    requirePin: notifyManager.clientPin !== undefined,
    pin: '',
  }));
  const metadataRef = useRef<{
    requestId: string | undefined;
    clientId: string | undefined;
    lock: boolean;
  }>({
    requestId: undefined,
    clientId: undefined,
    lock: false,
  });
  const stateRef = useLatestRef(state);
  const { execute: createP2PRequest, pending: creating } =
    useCreateP2PMutation();
  const { execute: discardP2PRequest } = useDiscardP2PMutation();
  const snackbar = useSnackbar();
  const i18n = useLingui();

  const statusTexts = useMemo(
    () => ({
      [ConnectionStatus.WaitingForAcceptance]: i18n._('Waiting for acceptance'),
      [ConnectionStatus.Connecting]: t(
        i18n.i18n,
      )`Connecting, using ${state.protocol} protocol`,
      [ConnectionStatus.TestingAvailability]: i18n._('Testing availability'),
      [ConnectionStatus.Connected]: t(
        i18n.i18n,
      )`Connected, delay ${state.delay}ms`,
      [ConnectionStatus.Accepted]: i18n._(
        'Accepted, waiting to establish connection',
      ),
      [ConnectionStatus.RejectedByPeer]: i18n._('The peer has refused'),
      [ConnectionStatus.ConnectionTimeout]: i18n._('Connection timeout'),
      [ConnectionStatus.WaitingForKeyInput]: i18n._(
        'Please enter the peer client PIN',
      ),
    }),
    [i18n, state.protocol, state.delay],
  );

  const createRequest = useCallback(
    async (id: string, target_pin?: string): Promise<boolean> => {
      metadataRef.current.lock = true;
      try {
        const res = await createP2PRequest({
          client_id: notifyManager.clientId!,
          target_id: id,
          supports_rtc: Reflect.has(window, 'RTCPeerConnection'),
          target_pin,
          priority: protocolPriority,
        });
        metadataRef.current.requestId = res.request_id;
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
      } finally {
        metadataRef.current.lock = false;
      }
    },
    [createP2PRequest, protocolPriority, snackbar],
  );

  const discardRequest = useCallback(
    (requestId: string) => {
      discardP2PRequest({ request_id: requestId }).catch(console.warn);
    },
    [discardP2PRequest],
  );
  const handleChangePin = useCallback((value: string) => {
    withProduce(setState, (draft) => {
      draft.pin = value;
    });
  }, []);
  useEffect(() => {
    let conn: RTCImpl | undefined = undefined;

    const testAvailability = async () => {
      if (!conn) return void 0;
      try {
        const delays: number[] = [];
        withProduce(setState, (draft) => {
          draft.status = ConnectionStatus.TestingAvailability;
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
          draft.status = ConnectionStatus.Connected;
        });
        onSuccess(conn, delay);
        // 放在该组件销毁时关闭连接，conn 已经转移处理者
        conn = undefined;
      } catch (e) {
        console.error(e);
        if (e instanceof Error) {
          withProduce(setState, (draft) => {
            draft.error = e as Error;
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
        const metadata = metadataRef.current;
        console.log('exchange', value);
        metadata.clientId = notifyManager.clientId;
        metadata.requestId = value.request_id;
        if (!metadata.requestId)
          throw new Error('Unexpected error, missing requestId');
        withProduce(setState, (draft) => {
          draft.status = ConnectionStatus.Connecting;
          draft.protocol = value.protocol;
        });
        switch (value.protocol) {
          case 'webrtc': {
            if (value.participants[0] == metadata.clientId) {
              const webrtc = new P2PRtc(metadata.requestId, metadata.clientId);
              await webrtc.createSender();
              conn = webrtc;
              console.log('conn instance', conn);
            }
            break;
          }
          case 'websocket': {
            conn = new P2PSocket(metadata.requestId, metadata.clientId!);
            console.log('conn instance', conn);
          }
        }
        conn?.once('CONNECTION_READY', () => {
          console.log('CONNECTION_READY');
          testAvailability();
        });
      }),
      notifyManager.on('P2P_SIGNALING', async (value) => {
        const metadata = metadataRef.current;
        if (value[0] == 0) {
          if (value[1].type === 'offer') {
            if (!metadata.requestId || !metadata.clientId) return void 0;
            const webrtc = new P2PRtc(metadata.requestId, metadata.clientId);
            await webrtc.createReceiver(value[1]);
            conn = webrtc;
            console.log('conn instance', conn);
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
        const metadata = metadataRef.current;
        console.log('id', id, 'requestId', metadata.requestId);
        if (id !== metadata.requestId) return void 0;
        withProduce(setState, (draft) => {
          draft.status = ConnectionStatus.RejectedByPeer;
        });
      }),
      () => {
        const metadata = metadataRef.current;
        if (metadata.requestId && mode == 'sender' && !conn)
          discardRequest(metadata.requestId);
      },
    );
  }, [
    createRequest,
    discardRequest,
    mode,
    onSuccess,
    protocolPriority,
    receiverId,
    snackbar,
    state.requirePin,
  ]);
  useEffect(() => {
    if (
      state.pin.length != 6 ||
      !receiverId ||
      stateRef.current.status > 3 ||
      metadataRef.current.lock
    )
      return void 0;
    createRequest(receiverId, state.pin).then((success) => {
      if (success) {
        withProduce(setState, (draft) => {
          draft.status = ConnectionStatus.WaitingForAcceptance;
        });
      }
    });
  }, [createRequest, receiverId, state.pin, stateRef]);
  const icon = (() => {
    switch (state.status) {
      case ConnectionStatus.RejectedByPeer:
        return (
          <XCircleIcon className="stroke-error-main h-[2.5rem] w-[2.5rem]" />
        );
      case ConnectionStatus.WaitingForKeyInput:
        return <KeyIcon className="-mt-4 h-[2rem] w-[2rem]" />;
      default:
        return (
          <svg
            viewBox="0 0 52 12"
            enableBackground="new 0 0 0 0"
            className="w-[2.5rem] fill-gray-600"
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
    <section className="flex min-h-[16rem] w-full flex-col items-center justify-between gap-2">
      {state.error ? (
        <div className="my-10 flex w-full flex-col items-center gap-2">
          <CircleXIcon className="-mt-4 h-[2.6rem] w-[2.6rem] text-red-600" />
          <div className="mt-2 text-left">
            <p className="font-bold">{i18n._('Oh! An error has occurred')}</p>
            <p className="text-gray-600">{String(state.error.message)}</p>
          </div>
        </div>
      ) : (
        <div className="my-10 flex w-full flex-col items-center gap-2">
          {icon}
          <div className="relative mt-10 text-center">
            {statusTexts[state.status]}
          </div>
          {state.status == ConnectionStatus.WaitingForKeyInput && (
            <div id="pin-input" className="mt-6">
              <InputOTP
                maxLength={6}
                disabled={creating}
                value={state.pin}
                onChange={handleChangePin}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup>
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
          )}
        </div>
      )}
      <Button variant="destructive" onClick={onCancel} className="px-3 py-2">
        {i18n._('Cancel')}
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
  const i18n = useLingui();

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
        const enableAck = false;
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
    async (evt: ChangeEvent<HTMLInputElement>) => {
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
  const recvFile = useCallback(
    (metadata: FileMetadata) => {
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

      const enableAck = false;
      const buffers = new Map<number, ArrayBuffer>();

      let receiver: AsyncGenerator<ArrayBuffer, void> | undefined = undefined;
      const stream = new ReadableStream({
        async start() {
          receiver = await conn.recv();
        },
        async pull(controller) {
          // console.log('start pull', fileSeq, packetSeq + 1);
          if (!receiver) throw new Error('Unexpected loss of receiver');
          try {
            let _packetSeq: number | undefined = packetSeq + 1;
            let packet: ArrayBuffer | undefined = buffers.get(_packetSeq);
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

              // Ignore packet from non-target file
              if (_fileSeq !== fileSeq) continue;
              _packetSeq = _packetSeq2;
              packet = value;
              break;
            }
            if (buffers.size > 16) {
              markFileAsAborted();
              controller.error(new Error('lack of buffer space'));
              receiver.return();
              return void 0;
            }

            if (_packetSeq && !buffers.has(_packetSeq)) {
              buffers.set(_packetSeq, packet);
              console.log(
                `Push #${_packetSeq} to buffer space, size: ${buffers.size}`,
              );
            }

            // 顺序错乱，结束并标记文件传输异常中止
            if (!buffers.has(packetSeq + 1)) {
              markFileAsAborted();
              controller.error(
                new PacketSequenceError(packetSeq + 1, _packetSeq),
              );
              receiver.return();
              return void 0;
            }
            packetSeq = packetSeq + 1;
            packet = buffers.get(packetSeq)!;
            buffers.delete(packetSeq);
            console.log(
              `Pop #${packetSeq} from buffer space, size: ${buffers.size}`,
            );
            // 推入 packet 至文件流
            // console.log('接收 PACKET', fileSeq, _packetSeq);
            controller.enqueue(new Uint8Array(packet.slice(8)));

            // 发送 ACK
            const packetLength = packet.byteLength - 8;
            received += packetLength;
            if (enableAck) {
              // await conn.waitForDrain();
              conn.send(createACKPacket(fileSeq, _packetSeq), PacketFlag.ACK);
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
    },
    [conn, downloadFile],
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
          // 表示已收到 Metadata Packet 数据, packetSeq 为 0
          conn.send(createACKPacket(metadata.seq, 0), PacketFlag.ACK);
          recvFile(metadata);
        } catch (e) {
          console.error(e);
        }
      }),
      conn.on('CONNECTION_CLOSE', ({ code, reason }) => {
        onClose(code, reason);
      }),
      conn.on('RTT_UPDATED', (rtt) => setRTT(rtt)),
    );
  }, [conn, onClose, recvFile]);
  return (
    <section className="flex w-full flex-col items-center gap-2">
      <p className="flex w-full gap-1 text-left text-sm">
        <span
          className={clsx(
            'px-1 uppercase text-white',
            conn.protocol == 'webrtc' && 'bg-[#2f8bd0]',
            conn.protocol == 'websocket' && 'bg-[#161616]',
          )}
        >
          {conn.protocol}
        </span>
        <span>{rtt}ms</span>
      </p>
      <div
        ref={containerRef}
        className="flex h-[15rem] w-full flex-col items-center justify-center rounded border border-dashed border-gray-300 text-sm"
      >
        <UploadIcon className="h-10 w-10" />
        <p className="mt-6 flex items-center gap-1">
          <span className="leading-none">
            {i18n._('Drag and Drop file here or')}
          </span>
          <button
            className="rounded-none px-1 leading-none underline"
            onClick={onClickChoose}
          >
            {i18n._('Choose file')}
          </button>
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onInputChange}
        />
      </div>
      <div className="mt-4 w-full text-sm">
        <span className="ml-1 font-bold">{i18n._('History:')}</span>
        <ul className="mt-2 max-h-[10rem] w-full overflow-y-auto">
          {deliveryItems.length == 0 ? (
            <li className="ml-1 mt-2 text-gray-300">{i18n._('No data')}</li>
          ) : (
            deliveryItems.map((it) => (
              <li
                key={it.seq}
                className="relative my-2 flex w-full items-center gap-2 border-b border-gray-100 p-2"
              >
                <div className="flex flex-1 flex-col overflow-hidden">
                  <div
                    className="w-full truncate leading-relaxed"
                    title={it.name}
                  >
                    {it.name}
                  </div>
                  <div className="flex flex-wrap gap-2 font-mono text-sm">
                    <span className="block">{it.progress}%</span>
                    <span className="block w-[12.5rem]">
                      {`(${formatBytes(it.transmitted)} / ${formatBytes(it.size)})`}
                    </span>
                    <span>[{formatBytes(it.rate)}/s] </span>
                    <span className="ml-1">ETA: {formatSeconds(it.eta)}</span>
                  </div>
                </div>
                <div className="mx-2 flex justify-end">
                  {it.progress === 100 ? (
                    <CheckCircleIcon className="h-4 w-4" />
                  ) : it.aborted ? (
                    <AlertCircleIcon className="stroke-error-main h-4 w-4" />
                  ) : (
                    <LoaderCircleIcon className="h-4 w-4 animate-spin" />
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
