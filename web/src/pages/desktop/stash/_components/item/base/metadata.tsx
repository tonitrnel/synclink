import { FC, memo } from 'react';
import { formatBytes } from '~/utils/format-bytes';
import { useEntry } from '../../../_hooks/use-entry.ts';

export const Metadata: FC<{
    features?: Array<'type' | 'size'>;
}> = memo(
    ({ features = ['type', 'size'] }) => {
        const entry = useEntry();
        return (
            <div className="flex h-4 min-w-0 flex-1 items-center gap-2">
                {features.includes('size') && (
                    <span className="text-sm leading-none whitespace-nowrap text-gray-800">
                        {formatBytes(entry.size)}
                    </span>
                )}
                {features.includes('type') && (
                    <span className="pad:pr-10 block truncate pr-4 text-sm leading-none text-gray-400">
                        {entry.mimetype}
                    </span>
                )}
            </div>
        );
    },
    (a, b) => {
        return a?.features === b.features?.length;
    },
);
