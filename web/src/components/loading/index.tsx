import { PropsWithChildren } from 'react';
import { clsx } from '~/utils/clsx.ts';
import { AnimatePresence, motion, Variants } from 'framer-motion';

export const Loading = ({
  className,
  children,
}: PropsWithChildren<{
  className?: string;
}>) => {
  return (
    <div
      className={clsx('inline-flex flex-col items-center relative', className)}
    >
      <span className="w-8 h-8 relative flex items-center content-center bg-transparent m-4">
        <i className="absolute h-full w-full top-0 left-0 rounded-full border-2 border-transparent border-b-current border-solid animate-spin-ease" />
        <i className="absolute h-full w-full top-0 left-0 rounded-full border-2 border-transparent border-b-current border-dotted animate-spin opacity-50" />
      </span>
      {children && <label className="mt-2 text-gray-600">{children}</label>}
    </div>
  );
};

Loading.Wrapper = ({
  className,
  children,
  visible,
}: PropsWithChildren<{
  className?: string;
  zIndex?: number;
  visible?: boolean;
}>) => {
  if (visible == undefined) {
    return (
      <div
        className={clsx(
          'absolute h-full w-full flex items-center justify-center z-10',
          className,
        )}
      >
        {children}
      </div>
    );
  } else
    return (
      <AnimatePresence>
        {visible && (
          <motion.div
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className={clsx(
              'absolute h-full w-full flex items-center justify-center z-10',
              className,
            )}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    );
};

const variants: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
  },
};
