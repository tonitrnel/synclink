import { createContext, ReactNode, useContext } from 'react';

export interface SnackbarProps {
  key?: string;
  autoHideDuration?: number | 'persist';
  className?: string;
  message: ReactNode;

  onClose?(): void;

  onExit?(): void;

  action?: ReactNode | ((snackbarId: string, className: string) => ReactNode);
  variant?: 'error' | 'success' | 'warning' | 'info' | 'default';
}

export interface SnackbarManager {
  enqueueSnackbar(props: SnackbarProps): {
    close(): void;
  };

  closeSnackbar(id: string): void;
}

export const __SNACKBAR_CONTEXT = createContext<SnackbarManager | undefined>(
  void 0
);

export const useSnackbar = (): SnackbarManager => {
  const ref = useContext(__SNACKBAR_CONTEXT);
  if (!ref)
    throw new Error(
      `"useSnackbar" hook must be invoke under <SnackbarProvider/>`
    );
  return ref;
};
