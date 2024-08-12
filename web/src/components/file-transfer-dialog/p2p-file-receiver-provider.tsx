import { FC, memo, useEffect } from 'react';
import { useToast } from '~/components/ui/toast';
import { useLingui } from '@lingui/react';
import { openFileTransfer } from './event.ts';
import { notifyManager } from '~/utils/notify-manager.ts';
import { NotificationMessage } from './notification-message.tsx';

export const P2PFileReceiverProvider: FC = memo(() => {
  const toast = useToast();
  const i18n = useLingui();
  useEffect(() => {
    let opened = false;
    const onClose = (accepted: boolean) => {
      opened = false;
      toast.dismiss();
      if (accepted)
        openFileTransfer({
          mode: 'receiver',
        });
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
          description: <NotificationMessage requestId={id} onClose={onClose} />,
        });
        if (document.visibilityState == 'hidden') {
          Notification.requestPermission().then((permission) => {
            // If the user accepts, let's create a notification
            if (permission === 'granted') {
              const notification = new Notification(
                i18n._(
                  'The villagers want to share some mysterious documents with you',
                ),
                {
                  body: i18n._('Please confirm if you want to accept'),
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
  }, [i18n, toast]);
  return null;
});
