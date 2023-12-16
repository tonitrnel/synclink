import {
  FC,
  memo,
  PropsWithChildren,
  ReactNode,
  useEffect,
  useMemo,
} from 'react';
import { SnackbarProps } from './context.ts';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  XCircleIcon,
} from 'icons';
import { clsx } from '~/utils/clsx.ts';
import { isFunction } from '@painted/shared';

export const Snackbar: FC<
  SnackbarProps & {
    id: string;
  }
> = memo(
  ({
    id,
    message,
    onClose,
    autoHideDuration = 5000,
    action,
    variant = 'default',
  }) => {
    // const autoHideDuration = useConstant(() => _autoHideDuration);
    useEffect(() => {
      if (autoHideDuration === 'persist') return void 0;
      let timer: number | void = window.setTimeout(() => {
        timer = void 0;
        onClose?.();
      }, autoHideDuration);
      return () => {
        if (timer) window.clearTimeout(timer);
      };
    }, [autoHideDuration, id, onClose]);
    const Variant = useMemo(() => SnackbarVariants[variant], [variant]);
    const actionElement = useMemo(() => {
      if (!action) return void 0;
      if (isFunction(action))
        return action(
          id,
          'w-5 h-5 cursor-pointer rounded-full p-1 bg-gray-300 bg-opacity-0 hover:bg-opacity-50'
        );
      else return action;
    }, [action, id]);
    return (
      <motion.li
        initial={{
          opacity: 0,
          translateY: -20,
          scale: 0.8,
        }}
        animate={{
          opacity: 1,
          translateY: 0,
          scale: 1,
        }}
        exit={{
          opacity: 0,
          scale: 0.8,
          translateY: -20,
          transition: { duration: 0.2 },
        }}
        layout="position"
        className="relative pointer-events-auto list-none "
      >
        <Variant
          id={id}
          message={message}
          action={actionElement}
          className="flex items-center pl-6 pr-10 py-2 rounded shadow-xl text-white gap-3 leading-none"
        />
      </motion.li>
    );
  }
);

const SnackbarVariants = {
  default: ({ message, className, action }) => {
    return (
      <div className={clsx(className)}>
        <div className="flex-1 py-4">{message}</div>
        {action}
      </div>
    );
  },
  error: ({ message, className, action }) => {
    return (
      <div className={clsx('bg-error-main', className)}>
        <XCircleIcon className="fill-white stroke-error-main w-7 h-7" />
        <div className="flex-1 py-4">{message}</div>
        {action}
      </div>
    );
  },
  warning: ({ message, className, action }) => {
    return (
      <div className={clsx('bg-warning-main', className)}>
        <AlertTriangleIcon className="fill-white stroke-warning-main w-7 h-7" />
        <div className="flex-1 py-4">{message}</div>
        {action}
      </div>
    );
  },
  success: ({ message, className, action }) => {
    return (
      <div className={clsx('bg-success-main', className)}>
        <CheckCircle2Icon className="fill-white stroke-success-main w-7 h-7" />
        <div className="flex-1 py-4">{message}</div>
        {action}
      </div>
    );
  },
  info: ({ message, className, action }) => {
    return (
      <div className={clsx('bg-info-main', className)}>
        <AlertCircleIcon className="fill-white stroke-info-main w-7 h-7" />
        <div className="flex-1 py-4">{message}</div>
        {action}
      </div>
    );
  },
} satisfies Record<
  NonNullable<SnackbarProps['variant']>,
  FC<
    Pick<SnackbarProps, 'message' | 'className'> & {
      id: string;
      action?: ReactNode;
    }
  >
>;
export const SnackbarContainer: FC<
  PropsWithChildren<{
    onExit(): void;
  }>
> = ({ children, onExit }) => {
  return (
    <ul className="fixed left-[50%] translate-x-[-50%] top-8 box-border max-h-full max-w-full h-auto z-10 flex items-center flex-col pointer-events-none gap-2 w-[80vw] pad:w-auto">
      <AnimatePresence onExitComplete={onExit}>{children}</AnimatePresence>
    </ul>
  );
};
