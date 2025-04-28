import { ComponentPropsWithoutRef, ElementRef, forwardRef } from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { clsx } from '~/utils/clsx';
import './scoll-area.css';

const ScrollArea = forwardRef<
    ElementRef<typeof ScrollAreaPrimitive.Root>,
    ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
    <ScrollAreaPrimitive.Root
        ref={ref}
        className={clsx('ui-scroll-area', className)}
        {...props}
    >
        <ScrollAreaPrimitive.Viewport className="ui-scroll-area-viewport">
            {children}
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar />
        <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = forwardRef<
    ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
    ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
        ref={ref}
        orientation={orientation}
        className={clsx(
            'ui-scroll-area-scrollbar',
            orientation === 'vertical' && 'vertical',
            orientation === 'horizontal' && 'horizontal',
            className,
        )}
        {...props}
    >
        <ScrollAreaPrimitive.ScrollAreaThumb className="ui-scroll-area-thumb" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
