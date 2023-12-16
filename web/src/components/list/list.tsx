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
import { wait } from '~/utils/wait.ts';
import { motion } from 'framer-motion';
import { useLatestFunc } from '@painted/shared';
import { useGetList } from '~/endpoints';
import { clsx } from '~/utils/clsx.ts';
import { withProduce } from '~/utils/with-produce.ts';

const logger = new Logger('synclink');

interface Pagination {
  page: number;
  size: number;
}

type SseMessage =
  | {
      type: 'ADD' | 'DELETE';
      uid: string;
    }
  | {
      type: 'HEART';
      time: number;
    };

const getEntity = async (uid: string) => {
  return fetch(`${__ENDPOINT}/api/${uid}`).then<IEntity>((res) => res.json());
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
  const [scrollReady, setScrollReday] = useState(false);
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
        list.concat((data.data as IEntity[]).filter((it) => !ids.has(it.uid)))
      );
    },
  });
  const previous = useMemo(
    () =>
      total > pagination.size * pagination.page ? pagination.page + 1 : void 0,
    [pagination.page, pagination.size, total]
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
    let window_hidden_timer: number | null = null;
    let heart_timer: number | null = null;
    let last_event_time: number | null = null;
    let last_heart_time: number | null = null;
    let connecting = false;
    const ids = new Set<string>();
    const handleSSEMessage = async (evt: MessageEvent) => {
      const payload: SseMessage = JSON.parse(evt.data);
      switch (payload.type) {
        case 'DELETE': {
          let total = -1;
          withProduce(setList, (draft) => {
            const index = draft.findIndex((it) => it.uid == payload.uid);
            draft.splice(index, 1);
            total = draft.length;
          });
          prohibitScrollLoadRef.current = true;
          if (total == 0) await refresh();
          break;
        }
        case 'ADD': {
          try {
            // fetching latest records..., ignore sse notification
            if (last_event_time) return void 0;
            if (ids.has(payload.uid)) return void 0;
            ids.add(payload.uid);
            const entity = await getEntity(payload.uid);
            setList((list) => [entity, ...list]);
            scrollToBottom();
          } catch (e) {
            logger.error('Update list failed', e);
          }
          break;
        }
        case 'HEART': {
          last_heart_time = payload.time;
          break;
        }
      }
    };
    const getLatestRecords = async () => {
      if (!last_event_time) return void 0;
      try {
        const records = await fetch(
          `${__ENDPOINT}/api?page=1&per_page=${10}&after=${last_event_time}`
        ).then<IEntity[]>((res) => (res.ok ? res.json() : []));
        if (records.length > 0) {
          logger.info(`updated ${records.length} records`);
          setList((list) => [...records, ...list]);
        }
      } finally {
        last_event_time = null;
      }
    };
    let abortController = new AbortController();
    const connectSse = async () => {
      let retry = 0;
      const connect = async (): Promise<EventSource | undefined> => {
        if (connecting) return void 0;
        connecting = true;
        try {
          return await new Promise<EventSource>((resolve, reject) => {
            const _sse = new EventSource(`${__ENDPOINT}/api/notify`);
            logger.debug('sse connecting...');
            _sse.onopen = () => {
              logger.debug('sse connected');
              resolve(_sse);
            };
            _sse.onerror = async () => {
              _sse.close();
              if (
                _sse.readyState == _sse.CONNECTING ||
                _sse.readyState == _sse.CLOSED
              ) {
                reject(new Error('sse connection failed'));
              }
              if (_sse.readyState == _sse.OPEN) {
                logger.debug('sse disconnected, try reconnecting.');
                connectSse().catch(console.error);
              }
            };
            _sse.onmessage = handleSSEMessage;
          });
        } finally {
          connecting = false;
        }
      };
      while (retry < 6) {
        try {
          const sse = await connect();
          if (!sse) return void 0;
          retry = 0;
          abortController.signal.throwIfAborted();
          abortController.signal.addEventListener('abort', () => {
            logger.debug(abortController.signal.reason);
            if (heart_timer) window.clearInterval(heart_timer);
            sse.close();
          });
          heart_timer = window.setInterval(() => {
            if (!last_heart_time) return void 0;
            if (last_heart_time + 3000 < Date.now()) {
              abortController.abort('heart packet timeout');
              abortController = new AbortController();
              connectSse().catch(console.error);
            }
          }, 3000);
          return void 0;
        } catch (e) {
          logger.warn((e as Error)?.message ?? e);
          retry += 1;
          const interval = 2 ** retry * 1000;
          logger.debug(`wait ${interval}ms retry`);
          await wait(interval);
        }
      }
      throw new Error(`more than ${6} connection failures, sse closed`);
    };
    const handleVisibility = () => {
      const visibility = document.visibilityState;
      if (visibility === 'hidden') {
        window_hidden_timer = window.setTimeout(() => {
          abortController.abort('inactive for more than 60s');
          window_hidden_timer = null;
          last_event_time = Date.now();
        }, 6_0000);
      } else {
        if (window_hidden_timer) window.clearTimeout(window_hidden_timer);
        if (!abortController.signal.aborted) return void 0;
        abortController = new AbortController();
        // reconnect sse
        connectSse().catch(logger.error);
        getLatestRecords().catch(logger.error);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    connectSse().catch(logger.error);
    return () => {
      abortController.abort('Component unmounted');
      document.removeEventListener('visibilitychange', handleVisibility);
    };
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
        setScrollReday(true);
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
                  'flex-1 px-1 pt-2 pb-1 transition-opacity',
                  !scrollReady && 'opacity-0'
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
