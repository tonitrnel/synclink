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
import { useLatestFunc } from '@painted/shared';
import { useGetList } from '~/endpoints';
import { clsx } from '~/utils/clsx.ts';
import { withProduce } from '~/utils/with-produce.ts';
import { notifyManager } from '~/utils/notify-manager.ts';
import { useSnackbar } from '~/components/ui/snackbar';

const logger = new Logger('cedasync');

interface Pagination {
  page: number;
  size: number;
}

const getEntity = async (uid: string) => {
  return fetch(`${__ENDPOINT__}/api/${uid}`).then<IEntity>((res) => res.json());
};
const __TIME = Date.now();

export const List: FC<{
  className?: string;
  onReady(): void;
}> = memo(({ className, onReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pagination, setPagination] = useState<Pagination>(() => ({
    page: 1,
    size: 10,
  }));
  const [total, setTotal] = useState(0);
  const [list, setList] = useState<IEntity[]>([]);
  const scrollStateRef = useRef({
    isProhibitScrollLoad: false,
    isProgrammaticScroll: false,
  });
  const snackbar = useSnackbar();
  const {
    done,
    error,
    pending: loading,
    refresh,
  } = useGetList({
    query: {
      page: pagination.page,
      per_page: pagination.size,
      before: __TIME,
    },
    onSuccess: (data) => {
      setTotal(data.total);
      const ids = new Set(list.map((it) => it.uid));
      setList(
        list.concat((data.data as IEntity[]).filter((it) => !ids.has(it.uid))),
      );
      // console.log("加载完成");
    },
  });
  const previous = useMemo(
    () =>
      total > pagination.size * pagination.page ? pagination.page + 1 : void 0,
    [pagination.page, pagination.size, total],
  );
  const _loadPrevious = useCallback(() => {
    if (!previous || loading) return void 0;
    // console.log("加载之前的数据");
    setPagination((prev) => ({
      page: previous,
      size: prev.size,
    }));
  }, [loading, previous]);
  const loadPrevious = useLatestFunc(_loadPrevious);
  const scrollToBottom = useCallback((behavior?: ScrollBehavior): void => {
    const element = containerRef.current;
    if (!element) return void 0;
    const currentHeight = element.scrollHeight - element.clientHeight;
    element.scrollTo({ top: currentHeight, behavior });
  }, []);
  useEffect(() => {
    if (!done || error) return void 0;
    let previousTimestamp = Date.now();
    const scrollState = scrollStateRef.current;
    const loadLatest = async () => {
      const records = await fetch(
        `${__ENDPOINT__}/api?page=1&per_page=${10}&after=${previousTimestamp}`,
      ).then<IEntity[]>((res) => (res.ok ? res.json() : []));
      if (records.length > 0) {
        logger.info(`updated ${records.length} records`);
        previousTimestamp = Date.now();
        withProduce(setList, (draft) => {
          const ids = new Set<string>(draft.map((it) => it.uid));
          return draft.concat(records.filter((it) => !ids.has(it.uid)));
        });
      }
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
        loadLatest().catch(console.error);
      }),
      notifyManager.on('RECORD_DELETED', async (uid) => {
        let total = -1;
        withProduce(setList, (draft) => {
          const index = draft.findIndex((it) => it.uid == uid);
          draft.splice(index, 1);
          total = draft.length;
        });
        previousTimestamp = Date.now();
        scrollState.isProhibitScrollLoad = true;
        if (total == 0) await refresh();
      }),
      notifyManager.on('RECORD_ADDED', async (uid) => {
        try {
          const entity = await getEntity(uid);
          withProduce(setList, (draft) => {
            const ids = new Set<string>(draft.map((it) => it.uid));
            if (ids.has(uid)) {
              return draft;
            } else {
              return [entity].concat(draft);
            }
          });
          previousTimestamp = Date.now();
          setTimeout(() => {
            scrollToBottom('smooth');
          }, 16);
        } catch (e) {
          logger.error('Failed to update list, reason:', e);
        }
      }),
    );
  }, [done, error, refresh, scrollToBottom, snackbar]);
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return void 0;
    const scrollState = scrollStateRef.current;
    const scrollWatcher = () => {
      if (scrollState.isProhibitScrollLoad) {
        scrollState.isProhibitScrollLoad = false;
        return void 0;
      }
      if (element.scrollTop <= 0) {
        loadPrevious();
        // 保持当前滚动位置
        element.scrollTop = 1;
      }
    };
    element.addEventListener('scroll', scrollWatcher);
    return () => {
      element.removeEventListener('scroll', scrollWatcher);
    };
  }, [loadPrevious]);
  useEffect(() => {
    if (!done) return void 0;
    const element = containerRef.current;
    if (!element) return void 0;
    const scrollState = scrollStateRef.current;
    const list = element.querySelector('ul')!;
    const items = [...list.children];
    if (items.length == 0) return void 0;
    let timer: number | undefined = void 0;
    // let startTime = Date.now();
    const resizeObs = new ResizeObserver(() => {
      // const resizeObs = new ResizeObserver((entries) => {
      //   const now = Date.now();
      //   console.log(
      //     'resize',
      //     timer,
      //     `${now - startTime}ms`,
      //     entries.map((it) => it.target),
      //   );
      //   startTime = now;
      scrollToBottom();
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = void 0;
        scrollToBottom();
        onReady();
        resizeObs.disconnect();
      }, 160);
    });
    items.forEach((item) => resizeObs.observe(item));
    const onScroll = () => {
      if (scrollState.isProgrammaticScroll) {
        scrollState.isProgrammaticScroll = false;
        return void 0;
      }
      resizeObs.disconnect();
      element.removeEventListener('scroll', onScroll);
    };
    element.addEventListener('scroll', onScroll);
    return () => {
      resizeObs.disconnect();
      element.removeEventListener('scroll', onScroll);
      // obs.disconnect();
    };
  }, [done, onReady, scrollToBottom]);
  const reversedList = useMemo(() => [...list].reverse(), [list]);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      ref={containerRef}
      className={className}
    >
      <div className="relative w-full h-full flex flex-col">
        {(() => {
          if (!done) return null;
          if (error)
            return (
              <Loading.Wrapper>
                <div className="inline-flex flex-col items-center relative text-center text-gray-400">
                  <AlertTriangleIcon
                    className="w-9 h-9 stroke-palette-bright-orange opacity-50"
                    strokeWidth={1.5}
                  />
                  <p className="block mt-4 capitalize">{String(error)}</p>
                </div>
              </Loading.Wrapper>
            );
          if (list.length == 0)
            return (
              <Loading.Wrapper>
                <div className="inline-flex flex-col items-center relative text-center text-gray-400">
                  <BirdIcon
                    className="w-9 h-9 stroke-gray-400 opacity-50"
                    strokeWidth={1.5}
                  />
                  <span className="block mt-4 capitalize">{t`no items found.`}</span>
                </div>
              </Loading.Wrapper>
            );
          return (
            <>
              {loading && <Loading />}
              <ul className={clsx('flex-1 pt-2 pb-8 transition-opacity')}>
                {reversedList.map((it) => (
                  <Item key={it.uid} it={it} />
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
