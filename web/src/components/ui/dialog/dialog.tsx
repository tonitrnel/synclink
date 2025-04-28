import {
    Children,
    ComponentPropsWithoutRef,
    DOMAttributes,
    ElementRef,
    FC,
    forwardRef,
    HTMLAttributes,
    isValidElement,
    PropsWithChildren,
    useCallback,
} from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';
import { clsx } from '~/utils/clsx.ts';
import { Trans } from '@lingui/macro';
import { AnimatePresence, motion, Variants } from 'framer-motion';
import { isNumber, isString } from '@ptdgrp/shared';

const DialogRoot = DialogPrimitive.Root;

export interface DialogProps {
    visible: boolean;
    onClose(): void;
    modal?: boolean;
    fullscreen?: boolean;
    className?: string;
}

const APPEND_TO = document.querySelector('#main');
const MotionDialogContent = motion(DialogPrimitive.Content);

const DialogImpl: FC<
    PropsWithChildren<
        DialogProps &
            Omit<HTMLAttributes<HTMLElement>, keyof DOMAttributes<HTMLElement>>
    >
> = ({
    visible,
    modal,
    fullscreen,
    onClose,
    children,
    className,
    ...props
}) => {
    const preventDefault = useCallback((evt: Event) => {
        evt.preventDefault();
    }, []);
    return (
        <DialogRoot open={visible} modal={modal} onOpenChange={onClose}>
            <AnimatePresence>
                {visible && (
                    <DialogPortal container={APPEND_TO}>
                        <DialogOverlay />
                        <div
                            className={clsx(
                                'fixed z-50',
                                fullscreen
                                    ? 'top-0 left-0 h-screen w-screen'
                                    : 'top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%]',
                            )}
                        >
                            <MotionDialogContent
                                className={clsx(
                                    'flex flex-col',
                                    fullscreen && 'h-full w-full',
                                    'bg-background border shadow',
                                    // 'data-[state=open]:animate-in data-[state=closed]:animate-out',
                                    // 'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
                                    // 'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
                                    // 'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
                                    // 'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
                                    !fullscreen && 'sm:rounded',
                                    className,
                                )}
                                onPointerDownOutside={preventDefault}
                                onOpenAutoFocus={preventDefault}
                                onEscapeKeyDown={preventDefault}
                                variants={modalAnimateVariants}
                                initial="initial"
                                animate="animate"
                                {...props}
                            >
                                {children}
                            </MotionDialogContent>
                        </div>
                    </DialogPortal>
                )}
            </AnimatePresence>
        </DialogRoot>
    );
};

const modalAnimateVariants: Variants = {
    initial: {
        opacity: 0,
        scale: 0.9,
    },
    animate: {
        opacity: 1,
        scale: 1,
    },
};

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = forwardRef<
    ElementRef<typeof DialogPrimitive.Overlay>,
    ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
        ref={ref}
        className={clsx(
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/80',
            className,
        )}
        {...props}
    />
));

const DialogHeader = ({
    className,
    children,
    ...props
}: HTMLAttributes<HTMLDivElement>) => {
    const { left, right } = partition(Children.toArray(children), (element) => {
        if (isString(element) || isNumber(element)) return 'left';
        if (isValidElement(element)) {
            if (element.type == 'button') {
                return 'right';
            } else {
                return 'left';
            }
        } else {
            return 'left';
        }
    });
    return (
        <div
            className={clsx(
                'border-b-solid flex min-h-[1.5rem] items-center justify-between border-b border-b-gray-300 px-4 py-3 text-center sm:text-left',
                className,
            )}
            {...props}
        >
            <div>{left}</div>
            <div className="flex gap-2">
                {right}
                <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground relative rounded-sm p-0.5 opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none">
                    <XIcon className="h-4 w-4" />
                    <span className="sr-only">
                        <Trans>Close</Trans>
                    </span>
                </DialogPrimitive.Close>
            </div>
        </div>
    );
};

const DialogFooter = ({
    className,
    ...props
}: HTMLAttributes<HTMLDivElement>) => (
    <div
        className={clsx(
            'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
            className,
        )}
        {...props}
    />
);

const DialogTitle = forwardRef<
    ElementRef<typeof DialogPrimitive.Title>,
    ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Title
        ref={ref}
        className={clsx(
            'text-lg leading-none font-semibold tracking-tight',
            className,
        )}
        {...props}
    />
));

const DialogContent: FC<PropsWithChildren<HTMLAttributes<HTMLDivElement>>> = ({
    className,
    ...props
}) => <div className={clsx('flex-1 p-4', className)} {...props} />;

const DialogDescription = forwardRef<
    ElementRef<typeof DialogPrimitive.Description>,
    ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Description
        ref={ref}
        className={clsx('text-muted-foreground text-sm', className)}
        {...props}
    />
));

const Dialog = DialogImpl as typeof DialogImpl & {
    Header: typeof DialogHeader;
    Content: typeof DialogContent;
    Footer: typeof DialogFooter;
    Title: typeof DialogTitle;
    Description: typeof DialogDescription;
};

Dialog.Content = DialogContent;
Dialog.Footer = DialogFooter;
Dialog.Header = DialogHeader;
Dialog.Title = DialogTitle;
Dialog.Description = DialogDescription;

const partition = <T, K extends string>(
    array: T[],
    filter: (element: T, index: number, array: T[]) => K,
): Record<K, T[]> => {
    const result = {} as Record<K, T[]>;
    array.forEach((element, index, array) => {
        const key = filter(element, index, array);
        if (!result[key]) result[key] = [];
        result[key].push(element);
    });
    return result;
};

export {
    Dialog,
    DialogClose,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
};
