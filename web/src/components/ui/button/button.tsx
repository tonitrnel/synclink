import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { clsv, clsx, VariantProps } from '~/utils/clsx.ts';
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip';
import { LoaderCircleIcon } from 'icons';

const buttonVariants = clsv(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline:
          'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

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
      <LoaderCircleIcon className="w-4 h-4 animate-spin" />
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
