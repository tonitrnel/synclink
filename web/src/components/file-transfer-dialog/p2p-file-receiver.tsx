import { FC, useCallback, useEffect, useRef } from 'react';
import { Toast } from 'primereact/toast';
import { Button } from 'primereact/button';
import { notifyManager } from '~/utils/notify-manager';
import {
  useDeleteDiscardP2PRequest,
  usePostAcceptP2PRequest,
} from '~/endpoints';
import { useDialog } from '~/utils/hooks/use-dialog';
import { P2pFileTransferDialog } from './p2p-file-transfer-dialog';
import { t } from '@lingui/macro';
import { useSnackbar } from '../snackbar';

export const P2PFileReceiver: FC = () => {
  const toastRef = useRef<Toast>(null);
  const p2pFileDialog = useDialog(P2pFileTransferDialog);
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
        if (document.visibilityState == 'hidden') {
          Notification.requestPermission().then((permission) => {
            // If the user accepts, let's create a notification
            if (permission === 'granted') {
              const notification = new Notification(
                t`The villagers want to share some mysterious documents with you`,
                {
                  body: t`Please confirm if you want to accept`,
                },
              );
              notification.addEventListener(
                'click',
                () => {
                  self.focus();
                  notification.close();
                },
                { once: true },
              );
            }
          });
        }
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
  const snackbar = useSnackbar();
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
        console.error(e);
        if (e instanceof Error) {
          snackbar.enqueueSnackbar({
            variant: 'error',
            message: e.message
          })
        }
        onClose(false);
      }
    },
    [acceptP2PRequest, onClose, snackbar],
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
      <p>{t`The villagers want to share some mysterious documents with you`}</p>
      <p className="mt-2 text-gray-400">{t`Do you want to receive it?`}</p>
      <div className="flex gap-2 mt-5">
        <Button
          className="px-3 py-2"
          severity="danger"
          disabled={accepting}
          loading={rejecting}
          onClick={() => onReject(requestId)}
        >
          {t`Reject`}
        </Button>
        <Button
          className="px-3 py-2 gap-2"
          severity="info"
          disabled={rejecting}
          loading={accepting}
          onClick={() => onAccept(requestId)}
        >
          {t`Accept`}
        </Button>
      </div>
    </section>
  );
};
