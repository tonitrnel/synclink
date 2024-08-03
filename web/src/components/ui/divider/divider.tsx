import {
  ComponentPropsWithoutRef,
  ElementRef,
  forwardRef,
  PropsWithChildren,
} from 'react';
import { clsv, clsx, VariantProps } from '~/utils/clsx.ts';

const dividerVariants = clsv(
  'flex relative before:absolute before:block before:border-gray-200',
  {
    variants: {
      align: {
        left: 'justify-start',
        center: 'justify-center',
        right: 'justify-end',
        top: 'items-start',
        bottom: 'items-end',
      },
      variant: {
        dashed: 'before:border-dashed',
        dotted: 'before:border-dotted',
        solid: 'before:border-solid',
      },
      layout: {
        horizontal:
          'w-full items-center before:top-[50%] before:left-0 before:w-full before:border-t my-5 px-5',
        vertical:
          'min-h-full mx-5 py-5 justify-center before:top-0 before:left-[50%] before:h-full before:border-l',
      },
    },
    compoundVariants: [
      {
        combinations: {
          layout: 'horizontal',
          align: 'left',
        },
        classes: 'justify-start',
      },
      {
        combinations: {
          layout: 'horizontal',
          align: 'right',
        },
        classes: 'justify-end',
      },
      {
        combinations: {
          layout: 'horizontal',
          align: 'center',
        },
        classes: 'justify-center',
      },
      {
        combinations: {
          layout: 'vertical',
          align: 'top',
        },
        classes: 'items-start',
      },
      {
        combinations: {
          layout: 'vertical',
          align: 'center',
        },
        classes: 'items-center',
      },
      {
        combinations: {
          layout: 'vertical',
          align: 'bottom',
        },
        classes: 'items-end',
      },
    ],
    defaultVariants: {
      align: 'left',
      variant: 'solid',
      layout: 'horizontal',
    },
  },
);

export interface DividerProps {
  align?: 'center' | 'left' | 'top' | 'bottom' | 'right';
  layout?: 'horizontal' | 'vertical';
  variant?: 'dashed' | 'dotted' | 'solid';
}

export const Divider = forwardRef<
  ElementRef<'div'>,
  ComponentPropsWithoutRef<'div'> &
    PropsWithChildren<VariantProps<typeof dividerVariants>>
>(({ align, variant, layout, className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={clsx(dividerVariants({ align, variant, layout }), className)}
      {...props}
    >
      {children && <div className="px-2 bg-background z-10">{children}</div>}
    </div>
  );
});
