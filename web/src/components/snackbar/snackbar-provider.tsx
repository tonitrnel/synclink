import { FC, PropsWithChildren, useCallback, useMemo, useState } from 'react';
import {
  __SNACKBAR_CONTEXT,
  SnackbarManager,
  SnackbarProps,
} from './context.ts';
import { withProduce } from '~/utils/with-produce.ts';
import { useLatestRef } from '@painted/shared';
import { Snackbar, SnackbarContainer } from './snackbar.tsx';

export const SnackbarProvider: FC<
  PropsWithChildren<{
    maxSnack?: number;
  }>
> = ({ children, maxSnack = 3 }) => {
  const [stack, setStack] = useState<
    { key: string; originalProps: Omit<SnackbarProps, 'key'> }[]
  >([]);
  const stackRef = useLatestRef(stack);
  const maxSnackRef = useLatestRef(maxSnack);
  const [exited, setExited] = useState(true);
  const manager = useMemo<SnackbarManager>(
    () => ({
      enqueueSnackbar(props: SnackbarProps) {
        const key = props.key ?? Math.random().toString(36).substring(2);
        if (stackRef.current.find((it) => it.key == key)) {
          throw new Error(`Duplicate snackbar key "${key}"`);
        }
        if (stackRef.current.length >= maxSnackRef.current) {
          stackRef.current[0].originalProps.onClose?.();
        }
        const onClose = () => {
          withProduce(setStack, (draft) => {
            const index = draft.findIndex((it) => it.key === key);
            draft.splice(index, 1);
          });
          props.onClose?.();
        };
        setExited(false);
        withProduce(setStack, (draft) => {
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
        const target = stackRef.current.find((it) => it.key == id);
        if (!target) return void 0;
        target.originalProps.onClose?.();
      },
    }),
    [maxSnackRef, stackRef],
  );
  const onExit = useCallback(() => {
    setExited(stackRef.current.length == 0 && true);
  }, [stackRef]);
  return (
    <__SNACKBAR_CONTEXT.Provider value={manager}>
      {children}
      {(stack.length > 0 || !exited) && (
        <SnackbarContainer onExit={onExit}>
          {stack.slice(0, maxSnack).map((it) => (
            <Snackbar key={it.key} id={it.key!} {...it.originalProps} />
          ))}
        </SnackbarContainer>
      )}
    </__SNACKBAR_CONTEXT.Provider>
  );
};
