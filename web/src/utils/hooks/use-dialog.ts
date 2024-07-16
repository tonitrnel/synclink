/* eslint-disable @typescript-eslint/ban-types,@typescript-eslint/no-explicit-any */

import { FC, useCallback, useEffect, useReducer, useRef } from 'react';
import { useLatestFunc } from '@painted/shared';
import { ExtractProps } from '~/constants/types.ts';

type Fn = (...args: any[]) => any;

type EventKeys<T extends {}> = {
  [P in keyof T]-?: NonNullable<T[P]> extends Fn ? P : never;
}[keyof T];

type ExcludeKeys<T extends {}> = EventKeys<T> | 'onClose' | 'visible';

type ReserveNonEventsProps<Props extends {}> = Omit<Props, ExcludeKeys<Props>>;

type SerialProps<
  Props extends {},
  NonEventsProps = ReserveNonEventsProps<Props>,
> = { [K in keyof NonEventsProps]: NonEventsProps[K] };

export type OpenFn<
  Props extends {},
  NonEventsProps extends {} = SerialProps<Props>,
> = {} extends NonEventsProps
  ? (props?: NonEventsProps) => void
  : (props: NonEventsProps) => void;

export type CloseFn<
  Props extends { onClose?: Fn },
  CloseFunc extends Fn = NonNullable<Props['onClose']>,
> = CloseFunc extends Fn
  ? (...args: Parameters<CloseFunc>) => ReturnType<CloseFunc>
  : Fn;

export interface DialogOptions<Props extends {}> {
  onClose?: CloseFn<Props>;
}
interface MetadataRef {
  unmounted: boolean;
  opened: boolean;
  closing: boolean;
  awaitQueue: {
    resolve(value: unknown): void;
    reject(reason: unknown): void;
  }[];
}
/**
 * dialog helper
 * @param Component
 * @param options
 */
export const useDialog = <
  C extends FC<any>,
  P extends ExtractProps<C> = ExtractProps<C>,
>(
  Component: C,
  options?: DialogOptions<P>,
) => {
  const metadataRef = useRef<MetadataRef>({
    unmounted: false,
    opened: false,
    closing: false,
    awaitQueue: [],
  });
  const propsRef = useRef<Partial<P>>();
  // force refresh
  const dispatchUpdate = useReducer(() => ({}), {
    name: Component.displayName ?? Component.name,
  })[1];
  const onClose = useLatestFunc(options?.onClose);
  const closeHandler = useCallback(
    async (...args: any[]) => {
      const metadata = metadataRef.current;
      if (metadata.closing || !metadata.opened) return void 0;
      try {
        metadata.closing = true;
        const result = await onClose?.(...args);
        propsRef.current = void 0;
        metadata.opened = false;
        metadata.awaitQueue.forEach(({ resolve }) => resolve(result));
        if (!metadata.unmounted) dispatchUpdate();
        return result;
      } finally {
        metadata.closing = false;
      }
    },
    [dispatchUpdate, onClose],
  );
  const openHandler = useCallback<
    // 该写法用于强制推导来保证编程体验
    OpenFn<P>
  >(
    (props: unknown) => {
      const metadata = metadataRef.current;
      if (metadata.opened) return void 0;
      if (props) propsRef.current = props as P;
      metadata.opened = true;
      dispatchUpdate();
    },
    [dispatchUpdate],
  );
  const awaitCloseHandler = useCallback(() => {
    const metadata = metadataRef.current;
    if (!metadata.opened) throw new Error('Dialog is not opened');
    return new Promise<ReturnType<CloseFn<P>>>((resolve, reject) => {
      metadata.awaitQueue.push({ resolve, reject });
    });
  }, []);
  type Expose = {
    visible: boolean;
    Dialog: C;
    DialogProps: P;
    open: typeof openHandler;
    close: typeof closeHandler;
    awaitClose: typeof awaitCloseHandler;
  };
  const exposeRef = useRef<Partial<Expose>>({
    Dialog: Component,
    open: openHandler,
    close: closeHandler,
    awaitClose: awaitCloseHandler,
  });
  useEffect(() => {
    const metadata = metadataRef.current;
    metadata.unmounted = false;
    return () => {
      metadata.unmounted = true;
    };
  });
  // Merge latest attribute
  {
    const metadata = metadataRef.current;
    Object.assign(exposeRef.current, {
      visible: metadata.opened,
      DialogProps: {
        visible: metadata.opened,
        onClose: closeHandler,
        ...propsRef.current,
      },
    });
  }
  return exposeRef.current as Expose;
};
