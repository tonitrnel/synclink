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
    title,
    message,
    onClose,
    autoHideDuration = 5000,
    action,
    variant = 'default',
    size = 'md',
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
          'w-5 h-5 cursor-pointer rounded-full p-1 bg-gray-300 bg-opacity-0 hover:bg-opacity-50',
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
        className="relative pointer-events-auto list-none"
      >
        <Variant
          id={id}
          title={title}
          message={message}
          action={actionElement}
          className={clsx(
            'flex items-center shadow-xl text-white gap-2 leading-none rounded-lg border border-solid border-gray-300',
            {
              sm: 'p-3',
              md: 'p-4',
              lg: 'p-5',
            }[size],
          )}
        />
      </motion.li>
    );
  },
);

const SnackbarVariants = {
  default: ({ title, message, className, action }) => {
    return (
      <div className={clsx('bg-[#fbfcfe] text-black', className)}>
        <div className="flex-1">
          {title ? (
            <>
              <p className="leading-normal">{title}</p>
              <p className="leading-normal text-gray-400">{message}</p>
            </>
          ) : (
            message
          )}
        </div>
        {action}
      </div>
    );
  },
  error: ({ title, message, className, action }) => {
    return (
      <div className={clsx('bg-error-main', className)}>
        <XCircleIcon className="fill-error-main stroke-white w-5 h-5 mr-1" />
        <div className="flex-1">
          {title ? (
            <>
              <p className="leading-normal">{title}</p>
              <p className="leading-normal text-gray-200">{message}</p>
            </>
          ) : (
            message
          )}
        </div>
        {action}
      </div>
    );
  },
  warning: ({ title, message, className, action }) => {
    return (
      <div className={clsx('bg-warning-main', className)}>
        <AlertTriangleIcon className="fill-warning-main stroke-white w-5 h-5 mr-1" />
        <div className="flex-1">
          {title ? (
            <>
              <p className="leading-normal">{title}</p>
              <p className="leading-normal text-gray-200">{message}</p>
            </>
          ) : (
            message
          )}
        </div>
        {action}
      </div>
    );
  },
  success: ({ title, message, className, action }) => {
    return (
      <div className={clsx('bg-success-main', className)}>
        <CheckCircle2Icon className="fill-success-main stroke-white w-5 h-5 mr-1" />
        <div className="flex-1">
          {title ? (
            <>
              <p className="leading-normal">{title}</p>
              <p className="leading-normal text-gray-200">{message}</p>
            </>
          ) : (
            message
          )}
        </div>
        {action}
      </div>
    );
  },
  info: ({ title, message, className, action }) => {
    return (
      <div className={clsx('bg-info-main', className)}>
        <AlertCircleIcon className="fill-info-main stroke-white w-5 h-5 mr-1" />
        <div className="flex-1">
          {title ? (
            <>
              <p className="leading-normal">{title}</p>
              <p className="leading-normal text-gray-200">{message}</p>
            </>
          ) : (
            message
          )}
        </div>
        {action}
      </div>
    );
  },
} satisfies Record<
  NonNullable<SnackbarProps['variant']>,
  FC<
    Pick<SnackbarProps, 'message' | 'title' | 'className'> & {
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
