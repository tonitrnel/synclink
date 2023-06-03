import { FC } from 'react';
import { clsx } from '../../utils/clsx.ts';
import './spin.css';

export const Spin: FC<{ className?: string }> = ({ className }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={clsx('spin', className)}
    >
      <circle
        cx="50"
        cy="50"
        r="40"
        stroke="currentColor"
        strokeWidth="10"
        fill="transparent"
        strokeDasharray="20 20"
      />
    </svg>
  );
};
