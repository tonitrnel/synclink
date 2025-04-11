import { FC, memo, useEffect, useMemo } from 'react';
import { SnackbarProps } from './context.ts';
import { AnimatePresence, motion, Variants } from 'framer-motion';
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  XCircleIcon,
} from 'lucide-react';
import { clsv } from '~/utils/clsx.ts';
import { isFunction } from '@ptdgrp/shared-react';

const snackbarVariants = clsv(
  'flex items-start shadow-xl gap-2 leading-none rounded-lg border border-solid border-[#00000046] text-sm [&>svg]:w-4 [&>svg]:h-4 [&>svg]:stroke-white',
  {
    variants: {
      size: {
        sm: 'p-2',
        md: 'p-3',
        lg: 'p-4',
      },
      variant: {
        default: 'bg-[#fbfcfe] text-black text-center',
        error: 'bg-rose-600 text-white [&>svg]:fill-rose-600',
        warning: 'bg-orange-600 text-white [&>svg]:fill-orange-600',
        success: 'bg-lime-600 text-white [&>svg]:fill-lime-600',
        info: 'bg-sky-600 text-white [&>svg]:fill-sky-600',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'default',
    },
  },
);

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
    variant,
    size,
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
    const icon = useMemo(() => {
      switch (variant) {
        case 'error':
          return <XCircleIcon />;
        case 'warning':
          return <AlertTriangleIcon />;
        case 'success':
          return <CheckCircle2Icon />;
        case 'info':
          return <AlertCircleIcon />;
        case 'default':
        default:
          return null;
      }
    }, [variant]);
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
        variants={animateVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        layout
        className="pointer-events-auto relative list-none"
      >
        <div id={id} className={snackbarVariants({ size, variant })}>
          {icon}
          <div className="mx-1 flex-1">
            {title ? (
              <>
                <p className="mb-1 leading-none">{title}</p>
                <p className="leading-normal text-gray-200">{message}</p>
              </>
            ) : (
              message
            )}
          </div>
          {actionElement}
        </div>
      </motion.li>
    );
  },
);

const animateVariants: Variants = {
  initial: {
    y: -100,
    scale: 0.6,
    opacity: 0,
  },
  animate: {
    y: 0,
    scale: 1,
    opacity: 1,
    transition: { duration: 0.3 },
  },
  exit: {
    scale: 0.9,
    opacity: 0,
    transition: { duration: 0.15 },
  },
};

export const SnackbarContainer: FC<{
  onExit(): void;
  items: { key: string; originalProps: Omit<SnackbarProps, 'key'> }[];
}> = ({ items, onExit }) => {
  return (
    <ol className="pointer-events-none fixed left-[50%] top-8 z-[9999] box-border flex w-[80vw] translate-x-[-50%] flex-col-reverse items-center gap-2 pad:w-auto">
      <AnimatePresence mode="popLayout" onExitComplete={onExit}>
        {items.map((it) => (
          <Snackbar key={it.key} id={it.key!} {...it.originalProps} />
        ))}
      </AnimatePresence>
    </ol>
  );
};
