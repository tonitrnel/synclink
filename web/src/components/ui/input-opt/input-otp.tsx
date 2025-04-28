import {
    ComponentPropsWithoutRef,
    ElementRef,
    forwardRef,
    useContext,
} from 'react';
import * as InputOTPPrimitive from 'input-otp';
import { clsx } from '~/utils/clsx.ts';

const InputOTP = forwardRef<
    ElementRef<typeof InputOTPPrimitive.OTPInput>,
    ComponentPropsWithoutRef<typeof InputOTPPrimitive.OTPInput>
>(({ className, containerClassName, ...props }, ref) => (
    <InputOTPPrimitive.OTPInput
        ref={ref}
        containerClassName={clsx(
            'flex items-center gap-2 has-[:disabled]:opacity-50',
            containerClassName,
        )}
        className={clsx('disabled:cursor-not-allowed', className)}
        {...props}
    />
));
InputOTP.displayName = 'InputOTP';

const InputOTPGroup = forwardRef<
    ElementRef<'div'>,
    ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={clsx('flex items-center', className)}
        {...props}
    />
));
InputOTPGroup.displayName = 'InputOTPGroup';

const InputOTPSlot = forwardRef<
    ElementRef<'div'>,
    ComponentPropsWithoutRef<'div'> & { index: number }
>(({ index, className, ...props }, ref) => {
    const inputOTPContext = useContext(InputOTPPrimitive.OTPInputContext);
    const { char, hasFakeCaret, isActive } = inputOTPContext.slots[index];

    return (
        <div
            ref={ref}
            className={clsx(
                'border-input relative flex h-9 w-9 items-center justify-center border-y border-r text-sm shadow-sm transition-all first:rounded-l-md first:border-l last:rounded-r-md',
                isActive && 'ring-ring z-10 ring-1',
                className,
            )}
            {...props}
        >
            {char}
            {hasFakeCaret && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="animate-caret-blink bg-foreground h-4 w-px duration-1000" />
                </div>
            )}
        </div>
    );
});
InputOTPSlot.displayName = 'InputOTPSlot';

const InputOTPSeparator = forwardRef<
    ElementRef<'div'>,
    ComponentPropsWithoutRef<'div'>
>(({ ...props }, ref) => (
    <div ref={ref} role="separator" {...props}>
        <svg viewBox="0 0 15 15" fill="none">
            <path
                d="M5 7.5C5 7.22386 5.22386 7 5.5 7H9.5C9.77614 7 10 7.22386 10 7.5C10 7.77614 9.77614 8 9.5 8H5.5C5.22386 8 5 7.77614 5 7.5Z"
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
            />
        </svg>
    </div>
));
InputOTPSeparator.displayName = 'InputOTPSeparator';

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator };
