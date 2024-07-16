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
import { SynclinkItem } from '~/components/item';
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

const logger = new Logger('synclink');

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
}> = memo(({ className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pagination, setPagination] = useState<Pagination>(() => ({
    page: 1,
    size: 10,
  }));
  const [total, setTotal] = useState(0);
  const [list, setList] = useState<IEntity[]>([]);
  const [scrollReady, setScrollReady] = useState(false);
  const prohibitScrollLoadRef = useRef(false);
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
    },
  });
  const previous = useMemo(
    () =>
      total > pagination.size * pagination.page ? pagination.page + 1 : void 0,
    [pagination.page, pagination.size, total],
  );
  const _loadPrevious = useCallback(() => {
    if (!previous || loading) return void 0;
    setPagination((prev) => ({
      page: previous,
      size: prev.size,
    }));
  }, [loading, previous]);
  const loadPrevious = useLatestFunc(_loadPrevious);
  const scrollToBottom = useCallback(async (): Promise<void> => {
    const element = containerRef.current;
    if (!element) return void 0;
    let height = element.scrollHeight - element.clientHeight;
    return new Promise<void>((resolve) => {
      const scroll = () => {
        const currentHeight = element.scrollHeight - element.clientHeight;
        if (currentHeight != height) {
          height = currentHeight;
          window.requestAnimationFrame(scroll);
          return void 0;
        }
        element.scrollTo({ top: currentHeight });
        resolve();
      };
      window.requestAnimationFrame(scroll);
    });
  }, []);
  useEffect(() => {
    if (!done || error) return void 0;
    let previousTimestamp = Date.now();
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
    notifyManager.ensureWork().catch(logger.error);
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
        prohibitScrollLoadRef.current = true;
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
          await scrollToBottom();
        } catch (e) {
          logger.error('Failed to update list, reason:', e);
        }
      }),
    );
  }, [done, error, refresh, scrollToBottom]);
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return void 0;
    const scrollWatcher = () => {
      if (prohibitScrollLoadRef.current) {
        prohibitScrollLoadRef.current = false;
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
    const ul = element.querySelector('ul');
    if (!ul) return void 0;
    let raf: number | undefined = void 0;
    const ulObs = new ResizeObserver(() => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(async () => {
        raf = void 0;
        await scrollToBottom();
        ulObs.disconnect();
        setScrollReady(true);
      });
    });
    ulObs.observe(ul);
    let previousHeight = element.getBoundingClientRect().height;
    const obs = new ResizeObserver((entries) => {
      const height = entries[0].contentRect.height;
      const isBottom =
        element.scrollTop ===
        element.scrollHeight - element.clientHeight + (height - previousHeight);
      if (previousHeight != 0 && previousHeight != height && isBottom) {
        scrollToBottom();
      }
      previousHeight = height;
    });
    obs.observe(element);
    return () => {
      obs.disconnect();
    };
  }, [done, scrollToBottom]);
  const reversedList = useMemo(() => [...list].reverse(), [list]);
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      ref={containerRef}
      className={className}
    >
      <div className="relative w-full h-full">
        {(() => {
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
          if (!done)
            return (
              <Loading.Wrapper>
                <Loading>
                  <span className="capitalize">{t`receiving`}</span>
                  <span className="ani_dot">...</span>
                </Loading>
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
            <motion.div className="flex h-full flex-col relative">
              {loading && <Loading />}
              <ul
                className={clsx(
                  'flex-1 px-1 pt-2 pb-8 transition-opacity',
                  !scrollReady && 'opacity-0',
                )}
              >
                {reversedList.map((it) => (
                  <SynclinkItem key={it.uid} it={it} />
                ))}
              </ul>
              <UploadManager scrollToBottom={scrollToBottom} />
            </motion.div>
          );
        })()}
      </div>
    </motion.section>
  );
});
