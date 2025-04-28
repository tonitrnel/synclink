import { forwardRef, InputHTMLAttributes } from 'react';
import { clsx } from '~/utils/clsx';
import './input.css';

export type InputProps = InputHTMLAttributes<HTMLInputElement>

const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={clsx('ui-input', className)}
                ref={ref}
                {...props}
            />
        );
    },
);
Input.displayName = 'Input';

export { Input };
