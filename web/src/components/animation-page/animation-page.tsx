import { motion, Variants } from 'framer-motion';
import { HTMLAttributes, FC, PropsWithChildren, DOMAttributes } from 'react';
import { clsx } from '~/utils/clsx';
import { useMediaQuery } from '~/utils/hooks/use-media-query.ts';

const transition = { ease: 'easeInOut', duration: 0.3 };
const mobileVariants: Variants = {
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
const desktopVariants: Variants = {
  initial: {
    opacity: 0,
    y: 20
  },
  in: {
    opacity: 1,
    y: 0,
  },
  out: {
    opacity: 0,
    y: -20,
    transition,
  },
};

export const AnimationPage: FC<
  PropsWithChildren<
    {
      animationEnabled?: boolean;
    } & Omit<HTMLAttributes<HTMLElement>, keyof DOMAttributes<HTMLElement>>
  >
> = ({ animationEnabled = true, children, className, ...props }) => {
  const isMobile = useMediaQuery(useMediaQuery.MOBILE_QUERY);
  return (
    <motion.section
      initial={animationEnabled ? 'initial' : undefined}
      animate={animationEnabled ? 'in' : undefined}
      exit={animationEnabled ? 'out' : undefined}
      variants={isMobile ? mobileVariants : desktopVariants}
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
