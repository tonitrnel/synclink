import {
    FC,
    ReactNode,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useLingui } from '@lingui/react';
import { DataEntryWithExtras, ItemType } from '~/pages/desktop/stash/_types';
import { useVirtualizer } from '@tanstack/react-virtual';
import { fetchTextCollection, useListQuery } from '~/endpoints';
import { withProduce } from '~/utils/with-produce.ts';
import { clsx } from '~/utils/clsx.ts';
import { Loading } from '~/components/loading';
import { Item } from '~/pages/desktop/stash/_components/item';
import { useLatestRef } from '@ptdgrp/shared';
import { debounce } from '~/utils/debounce.ts';
import { LruCache } from '~/utils/lru-cache.ts';

interface State {
    cursor: string | undefined;
    firstItemIndex: number;
    loadingOlder: boolean;
    scrollLock: boolean;
}

interface MetadataRef {
    isPrepending: boolean;
    isScrolled: boolean;
    initialCursor: string;
    hasMore: boolean;
    previousHeight: number;
    previousTop: number;
}

const NODES_CACHE = new LruCache<string, ReactNode>(20);

export const List: FC<{ className?: string }> = ({ className }) => {
    const i18n = useLingui();
    const [records, setRecords] = useState<DataEntryWithExtras[]>([]);
    const [state, setState] = useState<State>(() => ({
        cursor: undefined,
        firstItemIndex: 0,
        loadingOlder: false,
        scrollLock: false,
    }));
    const scrollElementRef = useRef<HTMLDivElement>(null);
    const virtualizer = useVirtualizer({
        count: records.length,
        getScrollElement: () => scrollElementRef.current,
        getItemKey: useCallback((idx: number) => records[idx].id, [records]),
        estimateSize: useCallback(
            (idx: number) => records[idx].__extras__.estimatedHeight,
            [records],
        ),
        overscan: 10,
    });
    const metadataRef = useRef<MetadataRef>({
        isPrepending: false,
        isScrolled: false,
        initialCursor: '',
        hasMore: false,
        previousHeight: 0,
        previousTop: 0,
    });
    const recordsRef = useLatestRef(records);
    const { pending, done } = useListQuery({
        query: {
            last: 15,
            before: state.cursor,
        },
        onSuccess: async ({ data, has_prev }) => {
            const texts = data.filter(
                (it) => it.mimetype.startsWith('text/') && it.size < 4096,
            ) as DataEntryWithExtras[];
            if (texts.length > 0) {
                const collections = await textBatchLoader(
                    texts.map((it) => it.id),
                );
                for (let i = 0; i < texts.length; ++i) {
                    texts[i].content = collections[i];
                }
            }
            withProduce(setState, (draft) => {
                draft.loadingOlder = false;
                draft.scrollLock = false;
            });
            metadataRef.current.hasMore = has_prev;
            const guesser = heightGuesser(scrollElementRef.current!);

            const entries: DataEntryWithExtras[] = data
                .map((it) => {
                    const itemType = getItemType(it.mimetype);
                    const estimatedHeight = guesser(
                        itemType,
                        it.metadata,
                        it.id,
                    );
                    return {
                        ...it,
                        __extras__: {
                            itemType,
                            estimatedHeight: Math.round(estimatedHeight),
                        },
                    } satisfies DataEntryWithExtras;
                })
                .toReversed();
            setRecords((prev) => [...entries, ...prev]);
            // metadataRef.current.isLoading = false;
            // console.log("加载完成");
        },
    });
    useEffect(() => {
        const scrollElement = scrollElementRef.current;
        if (!scrollElement) return;
        const loadOlder = debounce(() => {
            const records = recordsRef.current;
            const metadata = metadataRef.current;
            console.log('Loading older messages...', metadata);
            if (!metadata.hasMore || metadata.isPrepending) return;
            metadata.isPrepending = true;
            metadata.previousHeight = scrollElement.scrollHeight;
            metadata.previousTop = scrollElement.scrollTop;
            withProduce(setState, (draft) => {
                draft.loadingOlder = true;
                draft.scrollLock = true;
            });
            setTimeout(() => {
                withProduce(setState, (draft) => {
                    draft.cursor = records[0].cursor;
                });
            }, 3000);
        }, 160);
        const handleScroll = () => {
            if (scrollElement.scrollTop <= 50) {
                loadOlder();
            }
        };
        scrollElement.addEventListener('scroll', handleScroll);
        return () => scrollElement.removeEventListener('scroll', handleScroll);
    }, [recordsRef]);
    useLayoutEffect(() => {
        const records = recordsRef.current;
        if (
            done &&
            scrollElementRef.current &&
            !metadataRef.current.isScrolled
        ) {
            metadataRef.current.isScrolled = true;
            // const last = recordsRef.
            // virtualizer.scrollToOffset()
            const offset = virtualizer.getOffsetForIndex(
                records.length - 1,
                'end',
            );

            console.log(
                'scrolling',
                records.length,
                '#',
                offset,
                '->',
                virtualizer.getTotalSize(),
            );
            if (!offset) return void 0;
            virtualizer.scrollToOffset(virtualizer.getTotalSize(), {
                align: 'end',
            });
        }
    }, [done, recordsRef, virtualizer]);
    useLayoutEffect(() => {
        const scrollElement = scrollElementRef.current;
        const metadata = metadataRef.current;
        if (metadataRef.current.isPrepending && scrollElement) {
            const length = records.length;
            const newScrollHeight = scrollElement.scrollHeight;
            const heightDiff = newScrollHeight - metadata.previousHeight;

            scrollElement.scrollTop = metadata.previousTop + heightDiff;
            console.log(
                `Anchoring scroll: Added height=${heightDiff}, New scrollTop=${scrollElement.scrollTop}, length = ${length}`,
            );

            metadata.isPrepending = false;
        }
    }, [records.length]);

    const virtualItems = virtualizer.getVirtualItems();
    const cachedItems = useMemo(() => {
        return virtualItems.map((virtualItem) => {
            const item = records[virtualItem.index];
            if (NODES_CACHE.has(item.id)) {
                return [NODES_CACHE.get(item.id)!, virtualItem, item] as const;
            }
            const node = <Item data={item} />;
            NODES_CACHE.set(item.id, node);
            return [node, virtualItem, item] as const;
        });
    }, [records, virtualItems]);
    return (
        <div className={clsx('relative', className)}>
            {pending && (
                <Loading.Wrapper className="bg-background top-0 left-0">
                    <Loading>
                        <span className="capitalize">
                            {i18n._('Receiving')}
                        </span>
                        <span className="ani_dot">...</span>
                    </Loading>
                </Loading.Wrapper>
            )}
            <div className="absolute top-0 left-0 h-full w-full">
                <div
                    className={clsx(
                        'pointer-events-none absolute top-1 right-0 left-0 z-1 box-content h-6 w-full bg-white py-6 transition-opacity',
                        state.loadingOlder
                            ? 'visible opacity-100'
                            : 'invisible opacity-0',
                    )}
                >
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                        stroke="currentColor"
                        className="mx-auto size-6 text-gray-600"
                    >
                        <path
                            d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z"
                            opacity=".25"
                        />
                        <path d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z">
                            <animateTransform
                                attributeName="transform"
                                type="rotate"
                                dur="0.75s"
                                values="0 12 12;360 12 12"
                                repeatCount="indefinite"
                            />
                        </path>
                    </svg>
                </div>
                <div
                    ref={scrollElementRef}
                    className={clsx(
                        'scrollbar-present h-full w-full overflow-x-hidden overflow-y-auto pb-6 transition-transform contain-strict',
                        state.loadingOlder && 'translate-y-18',
                        // state.scrollLock
                        //     ? 'overflow-hidden'
                        //     : 'overflow-scroll',
                    )}
                    style={{ overflowAnchor: 'none' }}
                >
                    <div
                        className="relative mx-auto w-full max-w-4xl"
                        style={{
                            height: `${virtualizer.getTotalSize()}px`,
                        }}
                    >
                        {cachedItems.map(([node, virtualItem, item]) => {
                            return (
                                <div
                                    ref={virtualizer.measureElement}
                                    data-index={virtualItem.index}
                                    data-size={virtualItem.size}
                                    data-guess={item.__extras__.estimatedHeight}
                                    data-itemtype={item.__extras__.itemType}
                                    key={item.id}
                                    className="absolute top-0 left-0 w-full"
                                    style={{
                                        transform: `translateY(${virtualItem.start}px)`,
                                    }}
                                >
                                    {node}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

const textBatchLoader = async (uuids: string[]) => {
    return await fetchTextCollection({
        body: { uuids },
        serializers: {
            response: async (res) => {
                const lengths = res.headers
                    .get('x-collection-lengths')!
                    .split(',')
                    .map(Number);
                const buffer = new Uint8Array(await res.arrayBuffer());
                const textDecoder = new TextDecoder();
                let start = 0;
                return lengths.map((len) => {
                    const part = textDecoder.decode(
                        buffer.subarray(start, start + len),
                    );
                    start += len;
                    return part;
                });
            },
        },
    });
};
const heightGuesser = (scrollElement: HTMLElement) => {
    const globalFontSize = parseFloat(
        window.getComputedStyle(document.body).fontSize,
    );
    const rem = (v: number) => v * globalFontSize;
    const computedStyle = window.getComputedStyle(scrollElement);
    const FONT_SIZE = parseFloat(computedStyle.fontSize);
    const LINE_HEIGHT =
        parseFloat(computedStyle.lineHeight) ||
        parseFloat(computedStyle.fontSize) * 1.2;
    const SM_LINE_HEIGHT = 1.25 / 0.875;
    const SM_TEXT_HEIGHT = rem(0.875) * SM_LINE_HEIGHT;

    const ITEM_HEAD_HEIGHT = SM_TEXT_HEIGHT + rem(2) + 1; // font_size * line_height + padding_y + border_bottom
    const ITEM_BODY_EX_HEIGHT = rem(2); // padding_y
    const ITEM_FOOT_HEIGHT = rem(2) + rem(1); // font_size * 1(line_height) + margin_top
    const ITEM_EX_HEIGHT =
        ITEM_HEAD_HEIGHT + ITEM_BODY_EX_HEIGHT + ITEM_FOOT_HEIGHT;
    const CONTAINER_EX_HEIGHT = ITEM_EX_HEIGHT + rem(2); // 2 = padding_y;
    // image
    const IMAGE_EX_HEIGHT = SM_TEXT_HEIGHT + rem(0.5); // font_size * line_height + margin_top
    const IMAGE_CONTAINER_HEIGHT = IMAGE_EX_HEIGHT + CONTAINER_EX_HEIGHT;
    // text
    const TEXT_CONTAINER_HEIGHT = CONTAINER_EX_HEIGHT;
    // table
    const TABLE_HEAD_HEIGHT = rem(0.875) + rem(1.25) + 1; // font_size * line_height + padding_y + border;
    const TABLE_ROW_HEIGHT = SM_TEXT_HEIGHT + rem(1) + 1; // font_size * line_height + padding_y + border;
    const TABLE_CONTAINER_HEIGHT = CONTAINER_EX_HEIGHT + TABLE_HEAD_HEIGHT;

    console.log(
        'FONT_SIZE',
        FONT_SIZE,
        'LINE_HEIGHT',
        LINE_HEIGHT,
        'SM_TEXT_HEIGHT',
        SM_TEXT_HEIGHT,
        'A',
        TABLE_HEAD_HEIGHT,
    );

    const handlers = {
        text: (_line: number) => {
            return rem(2) + TEXT_CONTAINER_HEIGHT;
        },
        image: (thumbnail_height?: number) => {
            return (thumbnail_height ?? 220) + IMAGE_CONTAINER_HEIGHT;
        },
        video: () => 500,
        audio: () => 248,
        folder: (n: number, id: string) => {
            console.log(
                `${id} row i = `,
                n,
                ` t(${TABLE_ROW_HEIGHT}) = `,
                TABLE_ROW_HEIGHT * n,
            );
            return TABLE_CONTAINER_HEIGHT + TABLE_ROW_HEIGHT * n;
        },
        unknown: () => 160,
    } satisfies Record<ItemType, (...args: never[]) => number>;
    return (
        itemType: ItemType,
        metadata: DataEntryWithExtras['metadata'],
        id: string,
    ) => {
        switch (itemType) {
            case 'text':
                return handlers.text(0);
            case 'image':
                return handlers.image(
                    (metadata?.type == 'image' && metadata.thumbnail_height) ||
                        220,
                );
            case 'video':
                return handlers.video();
            case 'audio':
                return handlers.audio();
            case 'folder': {
                const n =
                    metadata?.type == 'archive'
                        ? metadata.entries.filter(
                              (it) =>
                                  !it.path.includes('/') ||
                                  it.path.split('/').length === 1,
                          ).length
                        : 0;
                return handlers.folder(n, id);
            }
            case 'unknown':
                return handlers.unknown();
        }
    };
};
const GROUP_MAP: [name: ItemType, type: string, subtype: string][] = [
    ['text', 'text', '*'],
    ['image', 'image', '*'],
    ['video', 'video', '*'],
    ['audio', 'audio', '*'],
    ['folder', 'application', 'x-tar'],
    ['unknown', '*', '*'],
];

const getItemType = (mimetype: string) => {
    const [type, subtype] = mimetype.split('/');
    return (
        GROUP_MAP.find(
            (it) =>
                (it[1] == type || it[1] == '*') &&
                (it[2] == subtype || it[2] == '*'),
        )?.[0] || 'unknown'
    );
};
