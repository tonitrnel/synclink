import { FC, useCallback } from 'react';
import { useSnackbar } from '~/components/ui/snackbar';
import { useLingui } from '@lingui/react';
import {
  useDiscardP2PMutation,
  useAcceptP2PMutation,
} from '~/endpoints';
import { notifyManager } from '~/utils/notify-manager.ts';
import { Button } from '~/components/ui/button';

export const NotificationMessage: FC<{
  requestId: string;
  onClose(accepted: boolean): void;
}> = ({ requestId, onClose }) => {
  const snackbar = useSnackbar();
  const i18n = useLingui();
  const { execute: acceptP2PRequest, pending: accepting } =
    useAcceptP2PMutation();
  const { execute: discardP2PRequest, pending: rejecting } =
    useDiscardP2PMutation();
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
      <p>
        {i18n._(
          'The villagers want to share some mysterious documents with you',
        )}
      </p>
      <p className="mt-2 text-gray-400">
        {i18n._('Do you want to receive it?')}
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button
          className="px-3 py-2"
          variant="destructive"
          disabled={accepting}
          loading={rejecting}
          onClick={() => onReject(requestId)}
        >
          {i18n._('Reject')}
        </Button>
        <Button
          className="gap-2 px-3 py-2"
          disabled={rejecting}
          loading={accepting}
          onClick={() => onAccept(requestId)}
        >
          {i18n._('Accept')}
        </Button>
      </div>
    </section>
  );
};
