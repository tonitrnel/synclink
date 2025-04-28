import { FC, HTMLAttributes, memo, useMemo } from 'react';
import { Metadata } from './metadata';
import { CustomMenuSlot, Menu } from './menu';
import { openViewer, supportsFileViewer } from '~/components/viewer-dialog';
import { EyeIcon } from 'lucide-react';
import { useLingui } from '@lingui/react';
import { clsx } from '~/utils/clsx.ts';
import { RenderProps } from './type.ts';
import { useEntry } from '../../../_hooks/use-entry.ts';

/**
 * 未知项
 *
 * @tips 高度已知
 */
export const UnknownItem: FC<HTMLAttributes<HTMLDivElement> & RenderProps> =
    memo(({ className, ...props }) => {
        const entry = useEntry();
        const i18n = useLingui();
        const previewButton = useMemo<CustomMenuSlot>(
            () => ({
                key: 'viewer',
                component: (
                    <>
                        <EyeIcon className="h-4 w-4" />
                        <span>{i18n._('Preview')}</span>
                    </>
                ),
                event: () =>
                    openViewer({
                        resourceId: entry.id,
                        filename: entry.name,
                        mimetype: entry.mimetype,
                    }),
            }),
            [entry.name, entry.mimetype, entry.id, i18n],
        );
        return (
            <div className={clsx('', className)} {...props}>
                <div className="item-header">
                    <p className="item-title truncate" title={entry.name}>
                        {entry.name}
                    </p>
                </div>
                <div className="mt-4 flex items-center justify-between">
                    <Metadata />
                    <Menu
                        slots={[
                            supportsFileViewer(entry.name, entry.mimetype) &&
                                previewButton,
                        ]}
                    />
                </div>
            </div>
        );
    });
