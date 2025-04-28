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
            className={clsx(
                'relative inline-flex flex-col items-center',
                className,
            )}
        >
            <span className="relative m-4 flex h-8 w-8 content-center items-center bg-transparent">
                <i className="animate-spin-ease absolute top-0 left-0 h-full w-full rounded-full border-2 border-solid border-transparent border-b-current" />
                <i className="absolute top-0 left-0 h-full w-full animate-spin rounded-full border-2 border-dotted border-transparent border-b-current opacity-50" />
            </span>
            {children && (
                <label className="mt-2 text-gray-600">{children}</label>
            )}
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
                    'absolute z-10 flex h-full w-full items-center justify-center',
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
                            'absolute z-10 flex h-full w-full items-center justify-center',
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
