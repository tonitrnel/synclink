import {
    FC,
    forwardRef,
    HTMLAttributes,
    RefObject,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useLingui } from '@lingui/react';
import {
    DataEntry,
    DataEntryWithExtras,
    ItemType,
} from '~/pages/desktop/stash/_types';
import {
    fetchTextCollection,
    useFileRecordQuery,
    useListQuery,
} from '~/endpoints';
import { withProduce } from '~/utils/with-produce.ts';
import { clsx } from '~/utils/clsx.ts';
import { Loading } from '~/components/loading';
import { Item } from '~/pages/desktop/stash/_components/item';
import { useLatestFunc, useLatestRef } from '@ptdgrp/shared';
import { debounce } from '~/utils/debounce.ts';
import { useRem2px } from '../../_hooks/use-rem2px.ts';
import { useComposedRefs } from '~/utils/hooks/use-compose-refs.ts';
import { useVirtualizer, Virtualizer } from '@tanstack/react-virtual';
import { notifyManager } from '~/utils/notify-manager.ts';
import { useSnackbar } from '~/components/ui/snackbar';
import { useUploadTasks } from '~/pages/desktop/stash/_hooks/use-upload-tasks.ts';
import { AnimatePresence } from 'framer-motion';
import { UploadItem } from '~/pages/desktop/stash/_components/upload/upload-item.tsx';

interface State {
    cursor: string | undefined;
    firstItemIndex: number;
    loadingOlder: boolean;
}

interface MetadataRef {
    isPrepending: boolean;
    // 标记反向行为完成
    isRevered: boolean;
    // 标记为已经追加
    isAdded: boolean;
    hasMore: boolean;
    previousHeight: number;
    previousTop: number;
}

const InitialLoadingIndicator: FC = () => {
    const i18n = useLingui();
    return (
        <Loading.Wrapper className="bg-background top-0 left-0">
            <Loading>
                <span className="capitalize">{i18n._('Receiving')}</span>
                <span className="ani_dot">...</span>
            </Loading>
        </Loading.Wrapper>
    );
};
const ScrollSentinel = forwardRef<
    HTMLDivElement,
    HTMLAttributes<HTMLDivElement> & {
        onLoad(): void;
    }
>(({ onLoad, className, ...props }, ref) => {
    const elementRef = useRef<HTMLDivElement>(null);
    const composedRefs = useComposedRefs(elementRef, ref);
    const onLoadFn = useLatestFunc(onLoad);
    // const [visible, setVisible] = useState<boolean>(false);
    useLayoutEffect(() => {
        if (!elementRef.current) return void 0;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                onLoadFn();
                // setVisible(true);
            } else {
                // setVisible(false);
            }
        });
        observer.observe(elementRef.current);
        return () => {
            observer.disconnect();
        };
    }, [onLoadFn]);
    return (
        <div
            ref={composedRefs}
            className={clsx(
                'pointer-events-none z-1 box-content h-6 w-full bg-white py-6 transition-opacity',
                // visible ? 'visible opacity-100' : 'invisible opacity-0',
                className,
            )}
            {...props}
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
    );
});
const SUPPORTED_SCROLLEND_EVENT = !('onscrollend' in window);
export const List: FC<{ className?: string }> = ({ className }) => {
    const [records, setRecords] = useState<DataEntryWithExtras[]>([]);
    const [state, setState] = useState<State>(() => ({
        cursor: undefined,
        firstItemIndex: 0,
        loadingOlder: false,
    }));
    const scrollElementRef = useRef<HTMLDivElement>(null);
    const metadataRef = useRef<MetadataRef>({
        isPrepending: false,
        isRevered: false,
        isAdded: true,
        hasMore: false,
        previousHeight: 0,
        previousTop: 0,
    });
    const recordsRef = useLatestRef(records);

    const rem2px = useRem2px();
    const snackbar = useSnackbar();
    const uploadTasks = useUploadTasks({
        scrollIntoView(index: number) {
            virtualizer.scrollToIndex(recordsRef.current.length + index + 1);
        },
    });
    const getItemByIndex = useCallback(
        (idx: number) => {
            const hasMore = metadataRef.current.hasMore;
            if (hasMore) {
                if (idx === 0) return { type: 'bottom-sentinel' } as const;
                else {
                    idx -= 1;
                }
            }
            if (uploadTasks.length > 0 && idx >= records.length) {
                return {
                    type: 'upload-task',
                    content: uploadTasks[idx - records.length],
                } as const;
            }
            return { type: 'record', content: records[idx] } as const;
        },
        [records, uploadTasks],
    );

    const virtualizer = useVirtualizer({
        // debug: true,
        count:
            records.length +
            (metadataRef.current.hasMore ? 1 : 0) +
            uploadTasks.length,
        getScrollElement: () => scrollElementRef.current,
        useScrollendEvent: SUPPORTED_SCROLLEND_EVENT,
        observeElementOffset,
        getItemKey: useCallback(
            (idx: number) => {
                const item = getItemByIndex(idx);
                switch (item.type) {
                    case 'bottom-sentinel':
                        return 'bottom-sentinel';
                    case 'upload-task':
                        return item.content;
                    case 'record':
                        return item.content.id;
                }
            },
            [getItemByIndex],
        ),
        estimateSize: useCallback(
            (idx: number) => {
                const item = getItemByIndex(idx);
                switch (item.type) {
                    case 'bottom-sentinel':
                        return rem2px(18);
                    case 'upload-task':
                        return rem2px(9);
                    case 'record':
                        return item.content.__extras__.estimatedHeight;
                }
            },
            [getItemByIndex, rem2px],
        ),
        overscan: 10,
    });
    const {
        pending,
        done,
        error,
        execute: executeListQuery,
    } = useListQuery({
        query: {
            last: 15,
            before: state.cursor,
        },
        onSuccess: async ({ data, has_prev }) => {
            const metadata = metadataRef.current;
            await patchTextBatch(data as DataEntryWithExtras[]);
            patchExtras(
                data as DataEntryWithExtras[],
                scrollElementRef,
                rem2px,
            );

            metadata.hasMore = has_prev;
            withProduce(setState, (draft) => {
                draft.loadingOlder = false;
            });
            setRecords((prev) => [
                ...(data.toReversed() as DataEntryWithExtras[]),
                ...prev,
            ]);
        },
        // Add onError handler
        onError: (error) => {
            console.error('useListQuery Error:', error);
            metadataRef.current.isPrepending = false;
        },
    });
    const fileRecordQuery = useFileRecordQuery({
        enabled: false,
    });
    const loadOrder = useMemo(
        () =>
            debounce(() => {
                const records = recordsRef.current;
                const metadata = metadataRef.current;
                const scrollElement = scrollElementRef.current;
                console.log('Loading older messages...', metadata);
                if (
                    !metadata.hasMore ||
                    metadata.isPrepending ||
                    !scrollElement
                )
                    return;
                metadata.isPrepending = true;
                metadata.previousHeight = scrollElement.scrollHeight;
                metadata.previousTop = scrollElement.scrollTop;
                withProduce(setState, (draft) => {
                    draft.loadingOlder = true;
                    draft.cursor = records[0].cursor;
                    // draft.scrollLock = true;
                });
            }, 160),
        [recordsRef],
    );
    const measureElement = useCallback(
        (node: HTMLElement | null | undefined) => {
            // const index = node?.dataset.index ? parseInt(node.dataset.index) : 0;
            // if (index <= 1  && !metadataRef.current.isRevered) return;

            virtualizer.measureElement(node);
        },
        [virtualizer],
    );
    // 在首次加载完成后跳转到最后一项
    useLayoutEffect(() => {
        const metadata = metadataRef.current;
        if (
            done &&
            scrollElementRef.current &&
            (!metadata.isRevered || !metadata.isAdded)
        ) {
            metadata.isRevered = true;
            const isAdded = !metadata.isAdded;
            metadata.isAdded = true;
            console.log('start calculateRange');
            virtualizer.calculateRange();
            // virtualizer.elementsCache
            // const last = recordsRef.
            // virtualizer.scrollToOffset()

            // if (!offset) return void 0;
            // virtualizer.scrollToIndex(records.length - 1, {
            //     align: 'end',
            //     behavior: 'auto',
            // });
            const offset = virtualizer.getOffsetForIndex(records.length, 'end');
            if (offset) {
                virtualizer.scrollToOffset(offset[0] + 23.5, {
                    behavior: isAdded ? 'smooth' : 'auto',
                });
                console.log(
                    'scrolled',
                    records.length,
                    '#',
                    `${offset[0]} ->`,
                    offset[0] + 23.5,
                    '->',
                    virtualizer.getTotalSize(),
                );
            }
            // setTimeout(() => {
            //     console.log('actual: ', virtualizer.getTotalSize());
            // }, 500);
        }
    }, [done, records.length, recordsRef, virtualizer]);
    // 当 records 变化时调整滚动条位置
    useLayoutEffect(() => {
        const scrollElement = scrollElementRef.current;
        const metadata = metadataRef.current;
        if (metadata.isPrepending && scrollElement) {
            // @ts-expect-error only keep track
            const _length = records.length;
            const newScrollHeight = scrollElement.scrollHeight;
            const heightDiff = newScrollHeight - metadata.previousHeight;

            if (heightDiff > 0) {
                scrollElement.scrollTop = metadata.previousTop + heightDiff;
                console.log(
                    `Anchoring scroll: Added height=${heightDiff}, PrevTop=${metadata.previousTop}, New scrollTop=${scrollElement.scrollTop}`,
                );
            } else {
                console.log(
                    `Anchoring scroll: No height change detected (NewH=${newScrollHeight}, PrevH=${metadata.previousHeight}).`,
                );
                if (scrollElement.scrollTop === 0 && metadata.previousTop > 0) {
                    scrollElement.scrollTop = metadata.previousTop; // Restore previous position if possible
                }
            }

            metadata.isPrepending = false;
        }
    }, [records.length]);
    // 处理来自 SSE 的记录新增、删除信息，如果 SSE 重连则还加载最新的记录
    useEffect(() => {
        if (!done || error) return void 0;
        const metadata = metadataRef.current;
        let cursor: string | undefined;
        notifyManager.ensureConnected().catch((reason) => {
            snackbar.enqueueSnackbar({
                variant: 'error',
                message: reason.message,
            });
        });
        return notifyManager.batch(
            notifyManager.on('CONNECTED', () => {
                console.log('CONNECTED', cursor);
                if (!cursor) return;
            }),
            notifyManager.on('DISCONNECTED', () => {
                cursor =
                    recordsRef.current[recordsRef.current.length - 1].cursor;
                console.log('DISCONNECTED', cursor);
            }),
            notifyManager.on('RECORD_REMOVED', async (id) => {
                const cursor = recordsRef.current[0].cursor;
                metadata.isPrepending = true;
                const res = await executeListQuery(
                    {
                        last: 1,
                        before: cursor,
                    },
                    { silent: true },
                );
                await patchTextBatch(res.data as DataEntryWithExtras[]);
                patchExtras(
                    res.data as DataEntryWithExtras[],
                    scrollElementRef,
                    rem2px,
                );
                metadata.hasMore = res.has_prev;
                metadata.isPrepending = false;
                withProduce(setRecords, (draft) => {
                    const index = draft.findIndex((it) => it.id === id);
                    draft.splice(index, 1);
                    draft.unshift(...(res.data as DataEntryWithExtras[]));
                });
            }),
            notifyManager.on('RECORD_ADDED', async (id) => {
                const res = await fileRecordQuery.execute(undefined, {
                    path: {
                        id,
                    },
                    silent: true,
                });
                const data = [res as DataEntryWithExtras];
                await patchTextBatch(data);
                patchExtras(data, scrollElementRef, rem2px);
                metadata.isAdded = false;
                withProduce(setRecords, (draft) => {
                    draft.push(...data);
                });
            }),
        );
    }, [
        done,
        error,
        executeListQuery,
        fileRecordQuery,
        recordsRef,
        rem2px,
        snackbar,
    ]);

    const virtualItems = virtualizer.getVirtualItems();
    return (
        <div className={clsx('relative', className)}>
            {!done && pending && <InitialLoadingIndicator />}
            <div className="absolute top-0 left-0 h-full w-full">
                <div
                    ref={scrollElementRef}
                    className={clsx(
                        'scrollbar-present anchor-none h-full w-full overflow-x-hidden overflow-y-auto pb-6 transition-transform contain-strict',
                        // state.loadingOlder && 'translate-y-18',
                        // state.scrollLock
                        //     ? 'overflow-hidden'
                        //     : 'overflow-scroll',
                    )}
                >
                    <div
                        className="relative mx-auto w-full max-w-4xl"
                        style={{
                            height: `${virtualizer.getTotalSize()}px`,
                        }}
                    >
                        <AnimatePresence>
                            {virtualItems.map((virtualItem) => {
                                const item = getItemByIndex(virtualItem.index);
                                if (item.type === 'bottom-sentinel') {
                                    return (
                                        <ScrollSentinel
                                            ref={measureElement}
                                            data-index={virtualItem.index}
                                            data-size={virtualItem.size}
                                            key="bottom-sentinel"
                                            data-itemtype="sentinel"
                                            className="absolute top-0 left-0 w-full"
                                            style={{
                                                transform: `translateY(${virtualItem.start}px)`,
                                            }}
                                            // loading={state.loadingOlder}
                                            onLoad={loadOrder}
                                        />
                                    );
                                }
                                if (item.type === 'upload-task') {
                                    return (
                                        <UploadItem
                                            key={item.content}
                                            id={item.content}
                                            data-index={virtualItem.index}
                                            data-size={virtualItem.size}
                                            data-itemtype="upload-task"
                                            style={{
                                                transform: `translateY(${virtualItem.start}px)`,
                                            }}
                                        />
                                    );
                                }
                                return (
                                    <div
                                        ref={virtualizer.measureElement}
                                        data-index={virtualItem.index}
                                        data-size={virtualItem.size}
                                        data-guess={
                                            item.content.__extras__
                                                .estimatedHeight
                                        }
                                        data-itemtype={
                                            item.content.__extras__.itemType
                                        }
                                        key={item.content.id}
                                        className="absolute top-0 left-0 w-full"
                                        style={{
                                            transform: `translateY(${virtualItem.start}px)`,
                                        }}
                                    >
                                        <Item data={item.content} />
                                    </div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
};

const loadTextBatch = async (uuids: string[]) => {
    return await fetchTextCollection({
        body: { uuids },
        serializers: {
            response: async (res) => {
                const rawLengths = res.headers.get('x-collection-lengths');
                if (!rawLengths) {
                    throw new Error('Missing "x-collection-lengths" header');
                }
                const segmentSizes = rawLengths
                    .split(',')
                    .map((s) => Number(s.trim()));
                const rawData = new Uint8Array(await res.arrayBuffer());
                const decoder = new TextDecoder();
                let start = 0;
                return segmentSizes.map((len) => {
                    const part = decoder.decode(
                        rawData.subarray(start, start + len),
                    );
                    start += len;
                    return part;
                });
            },
        },
    });
};
const patchTextBatch = async (data: DataEntryWithExtras[]) => {
    const texts = data.filter(
        (it) => it.mimetype.startsWith('text/') && it.size < 4096,
    ) as DataEntryWithExtras[];
    if (texts.length > 0) {
        try {
            const collections = await loadTextBatch(texts.map((it) => it.id));
            for (let i = 0; i < texts.length; ++i) {
                if (texts[i]) texts[i].content = collections[i];
            }
        } catch (error) {
            console.error('Failed to load text batch:', error);
            // Handle error appropriately
        }
    }
};
const patchExtras = (
    data: DataEntryWithExtras[],
    scrollElementRef: RefObject<HTMLElement>,
    rem2px: (rem: number) => number,
) => {
    const guesser = createHeightCalculator(scrollElementRef.current!, rem2px);
    for (const item of data) {
        const itemType = determineItemType(item.mimetype);
        const estimatedHeight = guesser(itemType, item);
        item['__extras__'] = {
            itemType,
            estimatedHeight: Math.round(estimatedHeight),
        };
    }
};
const createHeightCalculator = (
    scrollElement: HTMLElement,
    rem2px: (rem: number) => number,
) => {
    const computedStyle = window.getComputedStyle(scrollElement);
    const CONTAINER_WIDTH =
        (scrollElement.children[0] as HTMLElement).clientWidth -
        rem2px(2) -
        rem2px(0.5); // padding(p-4) + margin(mx-1)
    // 容器自身的字体大小（px）
    const FONT_SIZE = parseFloat(computedStyle.fontSize);
    // 容器自身的行高（px），如果没有显式设置，则取字体大小的 1.2 倍
    const LINE_HEIGHT =
        parseFloat(computedStyle.lineHeight) ||
        parseFloat(computedStyle.fontSize) * 1.2;
    // 默认行高比例（针对小字号文本）：1.25 ÷ 0.875
    const SM_LINE_HEIGHT = 1.25 / 0.875;
    // 默认小字号文本总高度（px）
    const SM_TEXT_HEIGHT = rem2px(0.875) * SM_LINE_HEIGHT;

    // —— 各部分高度定义 —— //
    const ITEM_HEAD_HEIGHT = SM_TEXT_HEIGHT + rem2px(2) + 1; // font_size * line_height + padding_y + border_bottom
    const ITEM_BODY_EX_HEIGHT = rem2px(2); // padding_y
    const ITEM_FOOT_HEIGHT = rem2px(2) + rem2px(1); // font_size * 1(line_height) + margin_top

    // 单个项目内容区的额外高度总和
    const ITEM_EX_HEIGHT =
        ITEM_HEAD_HEIGHT + ITEM_BODY_EX_HEIGHT + ITEM_FOOT_HEIGHT;
    // 项目容器增加的额外 padding
    const CONTAINER_EX_HEIGHT = ITEM_EX_HEIGHT + rem2px(2); // 2 = padding_y;
    // image
    const IMAGE_EX_HEIGHT = SM_TEXT_HEIGHT + rem2px(0.5); // font_size * line_height + margin_top
    const IMAGE_CONTAINER_HEIGHT = IMAGE_EX_HEIGHT + CONTAINER_EX_HEIGHT;
    // text
    const TEXT_CONTAINER_HEIGHT = CONTAINER_EX_HEIGHT;
    // table
    const TABLE_HEAD_HEIGHT = rem2px(0.875) + rem2px(1.25) + 1; // font_size * line_height + padding_y + border;
    const TABLE_ROW_HEIGHT = SM_TEXT_HEIGHT + rem2px(1) + 1; // font_size * line_height + padding_y + border;
    const TABLE_CONTAINER_HEIGHT = CONTAINER_EX_HEIGHT + TABLE_HEAD_HEIGHT;

    console.log(
        'FONT_SIZE',
        FONT_SIZE,
        'LINE_HEIGHT',
        LINE_HEIGHT,
        'SM_TEXT_HEIGHT',
        SM_TEXT_HEIGHT,
        'A',
        CONTAINER_EX_HEIGHT,
    );

    const sizeHandlers = {
        text: (content: string) => {
            return (
                Math.max(
                    rem2px(2),
                    estimateMixedScriptTextHeight(content, {
                        containerWidth: CONTAINER_WIDTH,
                        fontSizePx: rem2px(0.875),
                        lineHeightPx: SM_LINE_HEIGHT,
                        cjkWidthFactor: 1,
                        asciiLetterWidthFactor: 0.5,
                        asciiSymbolWidthFactor: 0.5,
                        otherWidthFactor: 1,
                        verticalPaddingPx: 0,
                        verticalBorderPx: 0,
                    }),
                ) + TEXT_CONTAINER_HEIGHT
            );
        },
        image: (thumbnail_height?: number) => {
            return (thumbnail_height ?? 220) + IMAGE_CONTAINER_HEIGHT;
        },
        video: () => rem2px(24) + CONTAINER_EX_HEIGHT,
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
        // 1.15 是 p 标签行高
        unknown: () => rem2px(1) * 1.15 + CONTAINER_EX_HEIGHT,
    } satisfies Record<ItemType, (...args: never[]) => number>;
    return (itemType: ItemType, item: DataEntry & { content?: string }) => {
        switch (itemType) {
            case 'text':
                return sizeHandlers.text(item.content || '');
            case 'image':
                return sizeHandlers.image(
                    (item.metadata?.type == 'image' &&
                        (item.metadata.thumbnail_height ||
                            item.metadata.height)) ||
                        220,
                );
            case 'video':
                return sizeHandlers.video();
            case 'audio':
                return sizeHandlers.audio();
            case 'folder': {
                const n =
                    item.metadata?.type == 'archive'
                        ? item.metadata.entries.filter(
                              (it) =>
                                  !it.path.includes('/') ||
                                  it.path.split('/').length === 1,
                          ).length
                        : 0;
                return sizeHandlers.folder(n, item.id);
            }
            case 'unknown':
                return sizeHandlers.unknown();
        }
    };
};
const CJK_UNICODE_RANGES_TABLE = {
    'CJK Unified Ideographs': [0x4e00, 0x9fff],
    'CJK Unified Ideographs Extension A': [0x3400, 0x4dbf],
    'CJK Unified Ideographs Extension B': [0x20000, 0x2a6df],
    'CJK Unified Ideographs Extension C': [0x2a700, 0x2b73f],
    'CJK Unified Ideographs Extension D': [0x2b740, 0x2b81f],
    'CJK Unified Ideographs Extension E': [0x2b820, 0x2ceaf],
    'CJK Unified Ideographs Extension F': [0x2ceb0, 0x2ebef],
    'CJK Unified Ideographs Extension G': [0x30000, 0x3134f],
    'CJK Unified Ideographs Extension H': [0x31350, 0x323af],
    'CJK Compatibility Ideographs': [0xf900, 0xfaff],
    'CJK Compatibility Ideographs Supplement': [0x2f800, 0x2fa1f],
    'CJK Radicals Supplement': [0x2e80, 0x2eff],
    'Kangxi Radicals': [0x2f00, 0x2fdf],
    'Ideographic Description Characters': [0x2ff0, 0x2fff],
    'Enclosed CJK Letters and Months': [0x3200, 0x32ff],
    'CJK Compatibility': [0x3300, 0x33ff],
    Hiragana: [0x3040, 0x309f],
    Katakana: [0x30a0, 0x30ff],
    'Hangul Syllables': [0xac00, 0xd7af],
} satisfies Record<string, [min: number, max: number]>;
const sortedCjkRanges: Array<[number, number]> = Object.values(
    CJK_UNICODE_RANGES_TABLE,
)
    .slice() // 断开引用
    .sort((a, b) => a[0] - b[0]);
const isCJKCharacter = (char: string): boolean => {
    const code = char.codePointAt(0)!;
    let lo = 0,
        hi = sortedCjkRanges.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const [min, max] = sortedCjkRanges[mid];
        if (code < min) {
            hi = mid - 1;
        } else if (code > max) {
            lo = mid + 1;
        } else {
            return true;
        }
    }
    return false;
};
type EstimateMixedScriptTextHeightOptions = {
    containerWidth: number;
    fontSizePx: number;
    lineHeightPx: number;
    // 宽度因子
    cjkWidthFactor: number;
    asciiLetterWidthFactor: number;
    asciiSymbolWidthFactor: number;
    otherWidthFactor: number;
    verticalPaddingPx: number;
    verticalBorderPx: number;
};
const getWidthFactor = (
    char: string,
    opts: EstimateMixedScriptTextHeightOptions,
): number => {
    const cp = char.codePointAt(0)!;

    // 1. CJK 字
    if (isCJKCharacter(char)) {
        return opts.cjkWidthFactor;
    }

    // 2. ASCII 范围
    if (cp <= 0x7f) {
        // 2.1 字母或数字
        if (
            (cp >= 0x30 && cp <= 0x39) || // 0-9
            (cp >= 0x41 && cp <= 0x5a) || // A-Z
            (cp >= 0x61 && cp <= 0x7a)
        ) {
            // a-z
            return opts.asciiLetterWidthFactor;
        }
        // 2.2 其他可见符号（包括空格、标点）
        return opts.asciiSymbolWidthFactor;
    }

    // 3. 其他 Unicode 字符
    return opts.otherWidthFactor;
};
const estimateMixedScriptTextHeight = (
    text: string,
    opts: EstimateMixedScriptTextHeightOptions,
) => {
    if (
        opts.containerWidth <= 0 ||
        opts.fontSizePx <= 0 ||
        opts.lineHeightPx <= 0
    ) {
        return (
            opts.lineHeightPx + opts.verticalPaddingPx + opts.verticalBorderPx
        );
    }

    const lines = text.split('\n');
    let totalWrappedLines = 0;

    for (const line of lines) {
        let unitWidthSum = 0;
        for (const char of line) {
            unitWidthSum += getWidthFactor(char, opts);
        }

        const pxWidth = unitWidthSum * opts.fontSizePx;
        const wraps = Math.max(1, Math.ceil(pxWidth / opts.containerWidth));
        totalWrappedLines += wraps;
    }

    const textHeight = totalWrappedLines * opts.lineHeightPx;
    const totalHeight =
        textHeight + opts.verticalPaddingPx + opts.verticalBorderPx;
    return Math.round(totalHeight);
};
const ITEM_TYPE_MAP: [name: ItemType, type: string, subtype: string][] = [
    ['text', 'text', '*'],
    ['image', 'image', '*'],
    ['video', 'video', '*'],
    ['audio', 'audio', '*'],
    ['folder', 'application', 'x-tar'],
    ['unknown', '*', '*'],
];

const determineItemType = (mimetype: string) => {
    const [type, subtype] = mimetype.split('/');
    return (
        ITEM_TYPE_MAP.find(
            (it) =>
                (it[1] == type || it[1] == '*') &&
                (it[2] == subtype || it[2] == '*'),
        )?.[0] || 'unknown'
    );
};

const OBS_EL_OFFSET_KEY = '__observe_element_offset_id';
const observeElementOffset = (
    instance: Virtualizer<HTMLDivElement, Element>,
    cb: (offset: number, isScrolling: boolean) => void,
) => {
    const element = instance.scrollElement;
    const targetWindow = instance.targetWindow;
    if (!element || !targetWindow) {
        return;
    }
    let offset = 0;
    const id = Math.random().toString(36).substring(2);
    // 用于解决 Strict Mode 多次触发
    Reflect.set(instance, OBS_EL_OFFSET_KEY, id);
    const fallback = SUPPORTED_SCROLLEND_EVENT
        ? () => undefined
        : debounce(() => {
              if (id !== Reflect.get(instance, OBS_EL_OFFSET_KEY)) return;
              // console.log(`[#${id}]set offset[B]: ${offset}`);
              cb(offset, false);
          }, instance.options.isScrollingResetDelay);

    const createHandler = (isScrolling: boolean) => () => {
        if (id !== Reflect.get(instance, OBS_EL_OFFSET_KEY)) return;
        const { horizontal, isRtl } = instance.options;
        offset = horizontal
            ? element['scrollLeft'] * ((isRtl && -1) || 1)
            : element['scrollTop'];
        // console.log(`[#${id}]set offset[A]: ${offset}`);
        fallback();
        cb(offset, isScrolling);
    };
    const handler = createHandler(true);
    const endHandler = createHandler(false);
    endHandler();
    element.addEventListener('scroll', handler, { passive: true });
    const registerScrollendEvent =
        instance.options.useScrollendEvent && SUPPORTED_SCROLLEND_EVENT;
    if (registerScrollendEvent) {
        element.addEventListener('scrollend', endHandler, { passive: true });
    }
    return () => {
        element.removeEventListener('scroll', handler);
        if (registerScrollendEvent) {
            element.removeEventListener('scrollend', endHandler);
        }
    };
};
