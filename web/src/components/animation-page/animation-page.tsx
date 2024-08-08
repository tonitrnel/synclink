import { motion, Variants } from 'framer-motion';
import { HTMLAttributes, FC, PropsWithChildren, DOMAttributes } from 'react';
import { clsx } from '~/utils/clsx';

const transition = { ease: 'easeInOut', duration: 0.3 };
const variants: Variants = {
  initial: {
    transition,
    boxShadow: '0 1.75rem 3.5rem -0.85rem rgba(0, 0, 0, 0.5)',
    x: '100%',
    opacity: 0.8,
  },
  in: {
    transition,
    x: 0,
    opacity: 1,
  },
  out: {
    transition,
    x: '100%',
    boxShadow: '0 1.75rem 3.5rem -0.85rem rgba(0, 0, 0, 0.5)',
    opacity: 0.8,
  },
};

export const AnimationPage: FC<
  PropsWithChildren<
    Omit<HTMLAttributes<HTMLElement>, keyof DOMAttributes<HTMLElement>>
  >
> = ({ children, className, ...props }) => {
  return (
    <motion.section
      initial="initial"
      animate="in"
      exit="out"
      variants={variants}
      className={clsx(
        'absolute bottom-0 left-0 right-0 top-0 z-10 h-full w-full overflow-hidden bg-background',
        className,
      )}
      {...props}
    >
      {children}
    </motion.section>
  );
};
