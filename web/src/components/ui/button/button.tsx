import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { clsv, clsx, VariantProps } from '~/utils/clsx.ts';
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip';
import { LoaderCircleIcon } from 'icons';
import './button.less';

const buttonVariants = clsv('ui-button', {
  variants: {
    variant: {
      default: 'variant-default',
      destructive: 'variant-destructive',
      outline: 'variant-outline',
      secondary: 'variant-secondary',
      ghost: 'variant-ghost',
      link: 'variant-ghost',
    },
    size: {
      default: 'size-default',
      sm: 'size-sm',
      lg: 'size-lg',
      icon: 'size-icon',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  tooltip?: ReactNode;
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      tooltip,
      loading,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    const loadingSlot = loading ? (
      <LoaderCircleIcon className="h-4 w-4 animate-spin" />
    ) : undefined;
    const child = (
      <Comp
        className={clsx(buttonVariants({ variant, size }), className)}
        ref={ref}
        disabled={loading || disabled}
        {...props}
      >
        {loadingSlot}
        {children}
      </Comp>
    );
    if (tooltip)
      return (
        <Tooltip>
          <TooltipTrigger asChild>{child}</TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      );
    else return child;
  },
);
Button.displayName = 'Button';

export { Button };
