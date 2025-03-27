import {
  FC,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertTriangleIcon, BirdIcon } from 'icons';
import { UploadManager } from '~/components/upload-manager';
import { Item } from '~/components/item';
import { IEntity } from '~/constants/types.ts';
import { Logger } from '~/utils/logger.ts';
import { Loading } from '~/components/loading';
import { t } from '@lingui/macro';
import { motion } from 'framer-motion';
import { useLatestFunc } from '@ptdgrp/shared-react';
import { useGetList, useGetTextCollection } from '~/endpoints';
import { clsx } from '~/utils/clsx.ts';
import { withProduce } from '~/utils/with-produce.ts';
import { notifyManager } from '~/utils/notify-manager.ts';
import { useSnackbar } from '~/components/ui/snackbar';
import { loadCoordinator } from '~/components/item/hooks/use-coordinator.ts';
import { lookupHTMLNode } from '~/utils/lookup-html-node.ts';
import { useLingui } from '@lingui/react';

const logger = new Logger('ephemera');

interface State {
  pagination: {
    page: number;
    size: number;
  };
  total: number;
  records: (IEntity & { content?: string })[];
  beforeTime: number;
}

const getEntity = async (uid: string) => {
  return fetch(`${__ENDPOINT__}/api/${uid}`).then<IEntity>((res) => res.json());
};
const __BEFORE_TIME__ = Date.now();
export const List: FC<{
  className?: string;
  onReady(): void;
}> = memo(({ className, onReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>(() => ({
    pagination: {
      page: 1,
      size: 10,
    },
    total: 0,
    records: [],
    beforeTime: __BEFORE_TIME__,
  }));
  const metadataRef = useRef({
    isProhibitScrollLoad: false,
    isLoading: false,
    ready: false,
  });
  const snackbar = useSnackbar();
  const {
    done,
    error,
    pending: loading,
    refresh,
    execute,
  } = useGetList({
    query: {
      page: state.pagination.page,
      per_page: state.pagination.size,
      before: state.beforeTime,
    },
    onSuccess: async (data) => {
      const textCollection = data.data.filter(
        (it) => it.type.startsWith('text/') && it.size < 4096,
      ) as State['records'];
      if (textCollection.length > 0) {
        const textCollectionContents = await useGetTextCollection({
          body: { uuids: textCollection.map((it) => it.uid) },
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
        for (let i = 0; i < textCollection.length; ++i) {
          textCollection[i].content = textCollectionContents[i];
        }
      }
      withProduce(setState, (draft) => {
        draft.total = data.total;
        draft.records.unshift(...data.data.toReversed());
      });
      metadataRef.current.isLoading = false;
      // console.log("加载完成");
    },
  });
  const previousPage = useMemo(
    () =>
      state.total > state.pagination.size * state.pagination.page
        ? state.pagination.page + 1
        : void 0,
    [state.pagination.page, state.pagination.size, state.total],
  );
  const loadPrevious = useLatestFunc(() => {
    const container = containerRef.current;
    if (!previousPage || loading || !container) return void 0;
    withProduce(setState, (draft) => {
      draft.pagination.page = previousPage;
    });
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    loadCoordinator.waitForNextBatch().then(() => {
      // const _scrollTop = container.scrollTop;
      const _scrollHeight = container.scrollHeight;
      // console.log(
      //   `finish loadPrevious\nscrollTop: ${scrollTop} > ${_scrollTop} > ${_scrollHeight - scrollHeight + scrollTop}`,
      //   `scrollHeight: ${scrollHeight} > ${_scrollHeight}`,
      // );
      container.scrollTo({
        top: _scrollHeight - scrollHeight + scrollTop,
        behavior: 'instant',
      });
    });
  });
  const scrollToBottom = useCallback((behavior?: ScrollBehavior): void => {
    const element = containerRef.current;
    if (!element) return void 0;
    const currentHeight = element.scrollHeight - element.clientHeight;
    element.scrollTo({ top: currentHeight, behavior });
  }, []);
  // 处理来自 SSE 的记录新增、删除信息，如果 SSE 重连则还加载最新的记录
  useEffect(() => {
    if (!done || error) return void 0;
    let afterTime = __BEFORE_TIME__;
    const metadata = metadataRef.current;
    const loadLatest = async () => {
      const records = await execute(
        {
          page: 1,
          per_page: 100,
          after: afterTime,
        },
        { silent: true },
      ).then((res) => res.data);
      if (records.length == 0) return void 0;
      afterTime = Date.now();
      logger.info(`Updated ${records.length} records`);
      withProduce(setState, (draft) => {
        draft.total += records.length;
        draft.records.push(...records);
      });
      await loadCoordinator.waitForNextBatch();
      scrollToBottom('smooth');
    };
    notifyManager.ensureWork().catch((error) => {
      logger.error(error);
      if (error instanceof Error) {
        snackbar.enqueueSnackbar({
          variant: 'error',
          message: error.message,
        });
      }
    });
    return notifyManager.batch(
      notifyManager.on('CONNECTED', () => {
        if (afterTime == __BEFORE_TIME__) return void 0;
        loadLatest().catch(console.error);
      }),
      notifyManager.on('DISCONNECTED', () => {
        afterTime = Date.now();
      }),
      notifyManager.on('RECORD_DELETED', async (uid) => {
        let total = -1;
        withProduce(setState, (draft) => {
          const index = draft.records.findIndex((it) => it.uid == uid);
          draft.records.splice(index, 1);
          total = draft.records.length;
        });
        metadata.isProhibitScrollLoad = true;
        if (total == 0) await refresh();
      }),
      notifyManager.on('RECORD_ADDED', async (uid) => {
        try {
          const entity = await getEntity(uid);
          withProduce(setState, (draft) => {
            draft.records.push(entity);
          });
          await loadCoordinator.waitForNextBatch();
          scrollToBottom('smooth');
        } catch (e) {
          logger.error('Failed to update list, reason:', e);
        }
      }),
    );
  }, [done, error, execute, refresh, scrollToBottom, snackbar]);
  const onLoadPreviousTrigger = useCallback(() => {
    const metadata = metadataRef.current;
    if (metadata.isLoading || !metadata.ready) return void 0;
    metadata.isLoading = true;
    // console.log('start loadPrevious');
    loadPrevious();
  }, [loadPrevious]);
  // 在 Loading 遮罩关闭前滚动至最底部
  useEffect(() => {
    if (!done) return void 0;
    const element = containerRef.current;
    if (!element) return void 0;
    const list = element.querySelector('ul')!;
    if (!list) {
      onReady();
      return void 0;
    }
    const items = [...list.children];
    if (items.length == 0) return void 0;
    // let startTime = Date.now();
    // 第三次滚动，在用户未主动滚动前还可尝试滚动至最底部，理论不会触发
    // const resizeObs = new ResizeObserver(() => {
    // const resizeObs = new ResizeObserver((entries) => {
    //   const now = Date.now();
    //   console.log(
    //     'resize',
    //     `${now - startTime}ms`,
    //     entries.map((it) => it.target),
    //   );
    //   startTime = now;
    // scrollToBottom();
    // });
    // const start = Date.now();
    // 第一次滚动，滚动至最底部
    scrollToBottom();
    // 第二次滚动和关闭 Loading 遮罩，当前批次的所有 Item 均高度已稳定（数据已加载）
    loadCoordinator.waitForNextBatch().then(() => {
      // console.log(
      //   'ready, isTimeout:',
      //   isTimeout,
      //   ' elapsed:',
      //   Date.now() - start,
      // );
      scrollToBottom();
      onReady();
      metadataRef.current.ready = true;
    });
    // items.forEach((item) => resizeObs.observe(item));
    return () => {
      // resizeObs.disconnect();
    };
  }, [done, onReady, scrollToBottom]);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      ref={containerRef}
      className={className}
    >
      <div className="relative flex h-full w-full flex-col">
        {(() => {
          if (!done) return null;
          if (error)
            return (
              <Loading.Wrapper>
                <div className="relative inline-flex flex-col items-center text-center text-gray-400">
                  <AlertTriangleIcon
                    className="stroke-palette-bright-orange h-9 w-9 opacity-50"
                    strokeWidth={1.5}
                  />
                  <p className="mt-4 block capitalize">{String(error)}</p>
                </div>
              </Loading.Wrapper>
            );
          if (state.records.length == 0)
            return (
              <Loading.Wrapper>
                <div className="relative inline-flex flex-col items-center text-center text-gray-400">
                  <BirdIcon
                    className="h-9 w-9 stroke-gray-400 opacity-50"
                    strokeWidth={1.5}
                  />
                  <span className="mt-4 block capitalize">{t`no items found.`}</span>
                </div>
              </Loading.Wrapper>
            );
          return (
            <>
              {loading && <Loading />}
              <LoadPreviousTrigger
                onTrigger={onLoadPreviousTrigger}
                hasMore={previousPage !== undefined}
              />
              <ul
                id="records"
                className={clsx('flex-1 pb-8 pt-2 transition-opacity')}
              >
                {state.records.map((it) => (
                  <Item key={it.uid} data={it} />
                ))}
              </ul>
              <UploadManager scrollToBottom={scrollToBottom} />
            </>
          );
        })()}
      </div>
    </motion.div>
  );
});

const LoadPreviousTrigger: FC<{
  onTrigger(): void;
  hasMore: boolean;
}> = ({ onTrigger: _onTrigger, hasMore }) => {
  const ref = useRef<HTMLDivElement>(null);
  const onTrigger = useLatestFunc(_onTrigger);
  const i18n = useLingui();
  useEffect(() => {
    const el = ref.current;
    if (!el) return void 0;
    let previousTime = 0;
    const obs = new IntersectionObserver(
      () => {
        const now = Date.now();
        if (now < previousTime + 1000) {
          return void 0;
        }
        previousTime = now;
        onTrigger();
      },
      {
        root: lookupHTMLNode(el, '.scroller'),
        rootMargin: '0px',
        threshold: 0.1,
      },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [onTrigger]);
  return (
    <div
      ref={ref}
      className={clsx(
        'pointer-events-none absolute left-0 top-0 w-full py-4 text-center text-sm text-gray-300',
        hasMore && 'invisible opacity-0',
      )}
      onClick={onTrigger}
    >
      {hasMore ? i18n._('Load previous') : i18n._('No more')}
    </div>
  );
};
