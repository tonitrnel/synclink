import { FC, useCallback, useEffect, useRef } from 'react';
import { Toast } from 'primereact/toast';
import { Button } from 'primereact/button';
import { notifyManager } from '~/utils/notify-manager';
import {
  useDeleteDiscardP2PRequest,
  usePostAcceptP2PRequest,
} from '~/endpoints';
import { useDialog } from '~/utils/hooks/use-dialog';
import { P2pFileDeliveryDialog } from './p2p-file-delivery-dialog';

export const P2PFileReceiver: FC = () => {
  const toastRef = useRef<Toast>(null);
  const p2pFileDialog = useDialog(P2pFileDeliveryDialog);
  useEffect(() => {
    let opened = false;
    const closeToast = (accepted: boolean) => {
      opened = false;
      toastRef.current?.clear();
      if (accepted) p2pFileDialog.open();
    };
    return notifyManager.batch(
      notifyManager.on('P2P_REQUEST', async (id) => {
        if (opened) return void 0;
        opened = true;
        toastRef.current?.show({
          summary: 'INFO',
          life: 5 * 60 * 1000,
          closable: false,
          className: 'backdrop-filter-none bg-[#fbfcfe]',
          contentClassName: 'border border-solid border-gray-300 rounded-lg',
          detail: <Message requestId={id} onClose={closeToast} />,
        });
      }),
    );
  }, [p2pFileDialog]);
  return (
    <>
      <Toast ref={toastRef} />
      {p2pFileDialog.visible && (
        <p2pFileDialog.Dialog {...p2pFileDialog.DialogProps} mode="receiver" />
      )}
    </>
  );
};

const Message: FC<{
  requestId: string;
  onClose(accepted: boolean): void;
}> = ({ requestId, onClose }) => {
  const { execute: acceptP2PRequest, pending: accepting } =
    usePostAcceptP2PRequest();
  const { execute: discardP2PRequest, pending: rejecting } =
    useDeleteDiscardP2PRequest();
  const onAccept = useCallback(
    async (requestId: string) => {
      try {
        await acceptP2PRequest(
          {
            request_id: requestId,
            client_id: notifyManager.clientId!,
            supports_rtc: Reflect.has(window, 'RTCPeerConnection'),
          },
          { silent: false },
        );
        onClose(true);
      } catch (e) {
        console.error('accept error', e);
      }
    },
    [acceptP2PRequest, onClose],
  );
  const onReject = useCallback(
    async (requestId: string) => {
      try {
        onClose(false);
        await discardP2PRequest({
          request_id: requestId,
        });
      } catch (e) {
        console.error('accept error', e);
      }
    },
    [onClose, discardP2PRequest],
  );
  return (
    <section>
      <p>村民想向你分享了一些神秘的文件</p>
      <p className="mt-2 text-gray-400">你是否要接收它</p>
      <div className="flex gap-2 mt-5">
        <Button
          className="px-3 py-2"
          severity="danger"
          disabled={accepting}
          loading={rejecting}
          onClick={() => onReject(requestId)}
        >
          拒绝
        </Button>
        <Button
          className="px-3 py-2 gap-2"
          severity="info"
          disabled={rejecting}
          loading={accepting}
          onClick={() => onAccept(requestId)}
        >
          接收
        </Button>
      </div>
    </section>
  );
};
