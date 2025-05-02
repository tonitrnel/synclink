import { forwardRef, HTMLAttributes, memo, useMemo, useRef } from 'react';
import { EntryProvider } from '../../_hooks/use-entry.ts';
import relativeTime from 'dayjs/plugin/relativeTime';
import dayjs from 'dayjs';
import { clsx } from '~/utils/clsx.ts';
import { useLingui } from '@lingui/react';
import { useComposedRefs } from '~/utils/hooks/use-compose-refs.ts';
import { ItemTypeComponentMap } from './base';
import { DataEntryWithExtras } from '../../_types';
import './item.css';

dayjs.extend(relativeTime);

const ItemImpl = forwardRef<
    HTMLDivElement,
    {
        data: DataEntryWithExtras;
        className?: string;
    } & HTMLAttributes<HTMLDivElement>
>(({ data, className, ...props }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const composedRefs = useComposedRefs(containerRef, ref);
    const i18n = useLingui();
    const time = useMemo(() => {
        const created = dayjs(data.created_at);
        const diff = Math.abs(created.diff(dayjs(), 'days'));
        if (diff > 7) {
            return (
                <span className="mr-2">
                    <span className="font-bold text-gray-700">
                        {created.format('MMM DD ')}
                    </span>
                    <span className="text-sm text-gray-600">
                        {created.format('A hh:mm')}
                    </span>
                </span>
            );
        } else {
            return (
                <span className="mr-2 text-gray-600">{created.fromNow()}</span>
            );
        }
    }, [data.created_at]);
    const from = useMemo(() => {
        if (!data.ipaddr || data.ipaddr == '::1' || data.ipaddr == '127.0.0.1')
            return <span className="ml-2">shared from unknown</span>;
        return (
            <span className="ml-2">
                <span className="text-gray-400">{i18n._('Shared from')}</span>
                <span className="ml-1 text-gray-500">
                    {data.device || data.ipaddr || i18n._('Unknown')}
                </span>
            </span>
        );
    }, [i18n, data.device, data.ipaddr]);
    const Render = ItemTypeComponentMap[data.__extras__.itemType];
    // console.count(data.id);
    return (
        <div
            ref={composedRefs}
            className={clsx(
                'item group relative mt-4 overflow-hidden rounded-2xl bg-white p-4',
                className,
            )}
            data-fileid={data.id}
            {...props}
        >
            <EntryProvider value={data}>
                <div className="mx-1 flex items-end border-b border-gray-100 py-4 text-sm">
                    {time}|{from}
                </div>
                <div className="mx-1 flex-1 rounded-2xl py-4">
                    <Render />
                </div>
            </EntryProvider>
        </div>
    );
});
export const Item = memo(ItemImpl);
