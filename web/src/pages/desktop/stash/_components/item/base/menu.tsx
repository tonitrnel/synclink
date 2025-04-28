import {
    FC,
    memo,
    ReactNode,
    useCallback,
    useMemo,
    type MouseEvent,
} from 'react';
import { t } from '@lingui/macro';
import {
    DownloadCloudIcon,
    Share2Icon,
    EraserIcon,
    EllipsisIcon,
} from 'lucide-react';
import { useSnackbar } from '~/components/ui/snackbar';
import { executeAsyncTask } from '~/utils/execute-async-task';
import { downloadFromURL } from '~/utils/save-as';
import { useMediaQuery } from '~/utils/hooks/use-media-query';
import { useLingui } from '@lingui/react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { clsx } from '~/utils/clsx.ts';
import { DataEntry } from '../../../_types';
import { useEntry } from '../../../_hooks/use-entry.ts';

export type CustomMenuSlot = {
    key: string;
    component: ReactNode;
    className?: string;
    event: (evt: MouseEvent<HTMLElement>) => void;
};

const SUPPORTED_SHARE =
    typeof window.navigator.share === 'function' &&
    typeof window.navigator.canShare === 'function';

export const Menu: FC<{
    features?: Array<
        | 'previewable'
        | 'downloadable'
        | 'deletable'
        | 'shareable'
        | false
        | undefined
    >;
    slots?: Array<CustomMenuSlot | false | undefined>;
}> = memo(
    ({
        features = ['downloadable', 'deletable', 'shareable'],
        slots: slotsProp = [],
    }) => {
        const entry = useEntry();
        const snackbar = useSnackbar();
        const i18n = useLingui();
        const onDelete = useMemo(
            () =>
                executeAsyncTask(async (id: string) => {
                    await fetch(`${__ENDPOINT__}/api/file/${id}`, {
                        method: 'DELETE',
                    });
                    document.body.dispatchEvent(
                        new CustomEvent('refresh-stats'),
                    );
                }),
            [],
        );
        const onShare = useMemo(
            () =>
                executeAsyncTask(async (entry: DataEntry) => {
                    if (
                        typeof navigator.share !== 'function' ||
                        !('canShare' in navigator)
                    )
                        return void 0;
                    const data = await (async (): Promise<ShareData | void> => {
                        // 5 MB
                        if (entry.size > 5_242_880) {
                            return {
                                title: entry.name,
                                url: `${__ENDPOINT__}/api/file/${entry.id}`,
                            };
                        }
                        if (entry.mimetype.startsWith('text/')) {
                            return {
                                title: entry.name,
                                text: await fetch(
                                    `${__ENDPOINT__}/api/file/${entry.id}`,
                                ).then((res) => res.text()),
                            };
                        }
                        return {
                            title: entry.name,
                            files: [
                                await fetch(
                                    `${__ENDPOINT__}/api/file/${entry.id}`,
                                )
                                    .then((res) => res.blob())
                                    .then(
                                        (blob) =>
                                            new File([blob], entry.name, {
                                                type: entry.mimetype,
                                            }),
                                    ),
                            ],
                        };
                    })();
                    try {
                        if (data && navigator.canShare(data))
                            await navigator.share(data);
                        else {
                            snackbar.enqueueSnackbar({
                                message: t`can't share this file`,
                                variant: 'warning',
                            });
                        }
                    } catch (e) {
                        snackbar.enqueueSnackbar({
                            message: e instanceof Error ? e.message : String(e),
                            variant: 'error',
                        });
                    }
                }),
            [snackbar],
        );
        const onDownload = useCallback(
            (evt: MouseEvent<HTMLElement>) => {
                evt.preventDefault();
                downloadFromURL(
                    `${__ENDPOINT__}/api/file/${entry.id}?raw`,
                    entry.name,
                );
            },
            [entry.name, entry.id],
        );
        const slots = useMemo<CustomMenuSlot[]>(() => {
            return [
                ...slotsProp.filter(
                    (it): it is CustomMenuSlot => typeof it === 'object',
                ),
                ...[
                    features.includes('downloadable') &&
                        ({
                            key: '__download',
                            className: 'hover:text-blue-600',
                            component: (
                                <>
                                    <DownloadCloudIcon className="h-4 w-4" />
                                    <span>{i18n._('Download')}</span>
                                </>
                            ),
                            event: onDownload,
                        } as CustomMenuSlot),
                    features.includes('shareable') &&
                        SUPPORTED_SHARE &&
                        ({
                            key: '__share',
                            className: 'hover:text-green-600',
                            component: (
                                <>
                                    <Share2Icon className="h-4 w-4" />
                                    <span>{i18n._('Share')}</span>
                                </>
                            ),
                            event: () => onShare(entry),
                        } as CustomMenuSlot),
                    features.includes('deletable') &&
                        ({
                            key: '__delete',
                            className: 'hover:text-red-600',
                            component: (
                                <>
                                    <EraserIcon className="h-4 w-4" />
                                    <span>{i18n._('Delete')}</span>
                                </>
                            ),
                            event: () => onDelete(entry.id),
                        } as CustomMenuSlot),
                ].filter((it): it is CustomMenuSlot => typeof it === 'object'),
            ];
        }, [entry, features, i18n, onDelete, onDownload, onShare, slotsProp]);
        return (
            <ButtonGroup
                slots={slots}
                className="invisible opacity-0 transition-opacity group-hover:visible group-hover:opacity-100"
            />
        );
    },
    (a, b) => {
        return (
            a.features?.length === b.features?.length &&
            a.slots?.length == b.slots?.length
        );
    },
);

interface MenuButtonGroupProps {
    slots: Array<CustomMenuSlot>;
    className?: string;
}

const ButtonGroup: FC<MenuButtonGroupProps> = ({ slots, className }) => {
    const isMobile = useMediaQuery(useMediaQuery.MOBILE_QUERY);
    return isMobile ? (
        <div
            className={clsx(
                'flex items-center gap-3 text-sm whitespace-nowrap',
                className,
            )}
        >
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <button className="focus-visible:ring-ring rounded p-2 focus-visible:ring-1 focus-visible:outline-none">
                        <EllipsisIcon className="h-4 w-4" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    {slots.map((it) => (
                        <DropdownMenuItem
                            key={it.key}
                            onClick={it.event}
                            className="flex items-center gap-1 [&>svg]:text-gray-600"
                        >
                            {it.component}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    ) : (
        <div
            className={clsx(
                'flex items-center gap-3 text-sm whitespace-nowrap',
                className,
            )}
        >
            {slots.map((it) => (
                <button
                    key={it.key}
                    className={clsx('item-action-button', it.className)}
                    onClick={it.event}
                >
                    {it.component}
                </button>
            ))}
        </div>
    );
};
