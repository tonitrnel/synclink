import { FC } from 'react';
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from './toast';
import { useToast } from './use-toast';

export const Toaster: FC = () => {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(
        ({ id, title, description, action, closable = true, ...props }) => {
          return (
            <Toast key={id} {...props}>
              <div className="grid gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
              {action}
              {closable && <ToastClose />}
            </Toast>
          );
        },
      )}
      <ToastViewport />
    </ToastProvider>
  );
};
