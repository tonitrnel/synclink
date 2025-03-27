import { FC, PropsWithChildren, useCallback, useMemo, useState } from 'react';
import {
  __SNACKBAR_CONTEXT__,
  SnackbarManager,
  SnackbarProps,
} from './context.ts';
import { withProduce } from '~/utils/with-produce.ts';
import { useLatestRef } from '@ptdgrp/shared-react';
import { SnackbarContainer } from './snackbar.tsx';

export const SnackbarProvider: FC<
  PropsWithChildren<{
    maxSnack?: number;
  }>
> = ({ children, maxSnack = 3 }) => {
  const [queue, setQueue] = useState<
    { key: string; originalProps: Omit<SnackbarProps, 'key'> }[]
  >([]);
  const queueRef = useLatestRef(queue);
  const [exited, setExited] = useState(true);
  const manager = useMemo<SnackbarManager>(
    () => ({
      enqueueSnackbar(props: SnackbarProps) {
        const key = props.key ?? Math.random().toString(36).substring(2);
        const queue = queueRef.current;
        if (queue.find((it) => it.key == key)) {
          throw new Error(`Duplicate snackbar key "${key}"`);
        }
        if (queue.length >= maxSnack) {
          queue[0]?.originalProps.onClose?.();
        }
        const onClose = () => {
          withProduce(setQueue, (draft) => {
            const index = draft.findIndex((it) => it.key === key);
            draft.splice(index, 1);
          });
          props.onClose?.();
        };
        setExited(false);
        withProduce(setQueue, (draft) => {
          const originalProps = {
            ...props,
            key: undefined,
            onClose,
          };
          Reflect.deleteProperty(originalProps, 'key');
          draft.push({
            originalProps,
            key,
          });
        });
        return { close: onClose };
      },
      closeSnackbar(id: string) {
        const target = queueRef.current.find((it) => it.key == id);
        if (!target) return void 0;
        target.originalProps.onClose?.();
      },
    }),
    [maxSnack, queueRef],
  );
  const onExit = useCallback(() => {
    setExited(queueRef.current.length == 0 && true);
  }, [queueRef]);
  return (
    <__SNACKBAR_CONTEXT__.Provider value={manager}>
      {children}
      {(queue.length > 0 || !exited) && (
        <SnackbarContainer onExit={onExit} items={queue} />
      )}
    </__SNACKBAR_CONTEXT__.Provider>
  );
};
