import { FC, useCallback, useEffect } from 'react';
import { notifyManager } from '~/utils/notify-manager';
import {
  useDeleteDiscardP2PRequest,
  usePostAcceptP2PRequest,
} from '~/endpoints';
import { useDialog } from '~/utils/hooks/use-dialog';
import { P2pFileTransferDialog } from './p2p-file-transfer-dialog';
import { useSnackbar } from '../ui/snackbar';
import { useToast } from '~/components/ui/toast';
import { Button } from '~/components/ui/button';
import { useLingui } from '@lingui/react'

export const P2PFileReceiver: FC = () => {
  const toast = useToast();
  const p2pFileDialog = useDialog(P2pFileTransferDialog);
  const i18n = useLingui();
  useEffect(() => {
    let opened = false;
    const closeToast = (accepted: boolean) => {
      opened = false;
      toast.dismiss();
      if (accepted) p2pFileDialog.open();
    };
    return notifyManager.batch(
      notifyManager.on('P2P_REQUEST', async (id) => {
        if (opened) return void 0;
        opened = true;
        toast.toast({
          title: 'INFO',
          duration: 5 * 60 * 1000,
          closable: false,
          className: 'bg-[#fbfcfe]',
          // contentClassName: 'border border-solid border-gray-300 rounded-lg',
          description: <Message requestId={id} onClose={closeToast} />,
        });
        if (document.visibilityState == 'hidden') {
          Notification.requestPermission().then((permission) => {
            // If the user accepts, let's create a notification
            if (permission === 'granted') {
              const notification = new Notification(
                i18n._("The villagers want to share some mysterious documents with you"),
                {
                  body: i18n._("Please confirm if you want to accept"),
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
  }, [i18n, p2pFileDialog, toast]);
  if (!p2pFileDialog.visible) return null;
  return (
    <p2pFileDialog.Dialog {...p2pFileDialog.DialogProps} mode="receiver" />
  );
};

const Message: FC<{
  requestId: string;
  onClose(accepted: boolean): void;
}> = ({ requestId, onClose }) => {
  const snackbar = useSnackbar();
  const i18n = useLingui();
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
            message: e.message,
          });
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
      <p>{i18n._("The villagers want to share some mysterious documents with you")}</p>
      <p className="mt-2 text-gray-400">{i18n._("Do you want to receive it?")}</p>
      <div className="flex gap-2 mt-5 justify-end">
        <Button
          className="px-3 py-2"
          variant="destructive"
          disabled={accepting}
          loading={rejecting}
          onClick={() => onReject(requestId)}
        >
          {i18n._("Reject")}
        </Button>
        <Button
          className="px-3 py-2 gap-2"
          disabled={rejecting}
          loading={accepting}
          onClick={() => onAccept(requestId)}
        >
          {i18n._("Accept")}
        </Button>
      </div>
    </section>
  );
};
