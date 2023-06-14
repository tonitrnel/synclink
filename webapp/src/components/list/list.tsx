import { FC, memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ReactComponent as AlertTriangleIcon } from '~/assets/alert-triangle.svg';
import { UploadManager } from '~/components/upload-manager';
import { SynclinkItem } from '~/components/item';
import { Spin } from '~/components/spin';
import { useGet } from '~/utils/hooks/use-get.ts';
import { IEntity } from '~/constants/types.ts';
import { Logger } from '~/utils/logger.ts';
import './list.css';

const logger = new Logger('List');

interface Pagination {
  page: number;
  size: number;
}

const getEntity = async (uid: string) => {
  return fetch(`${__ENDPOINT}/${uid}/metadata`).then<IEntity>((res) =>
    res.json()
  );
};
const __TIME = Date.now();

export const List: FC = memo(() => {
  const [pagination, setPagination] = useState<Pagination>(() => ({
    page: 1,
    size: 10,
  }));
  const [total, setTotal] = useState(0);
  const [list, setList] = useState<IEntity[]>([]);
  const [, { done, error }] = useGet<void>(
    `${__ENDPOINT}?page=${pagination.page}&per_page=${pagination.size}&before=${__TIME}`,
    async (res) => {
      const val = await res.json();
      setTotal(val.total);
      const ids = new Set(list.map((it) => it.uid));
      setList(
        list.concat((val.data as IEntity[]).filter((it) => !ids.has(it.uid)))
      );
    }
  );
  const previous = useMemo(
    () =>
      total > pagination.size * pagination.page ? pagination.page + 1 : void 0,
    [pagination.page, pagination.size, total]
  );
  const loadPrevious = useCallback(() => {
    if (!previous) return void 0;
    setPagination((prev) => ({
      page: previous,
      size: prev.size,
    }));
  }, [previous]);
  useEffect(() => {
    let sse: EventSource | null = null;
    let timer: number | null = null;
    let last_active_time: number | null = null;
    const handleSSEMessage = async (evt: MessageEvent) => {
      const payload: { type: 'ADD' | 'DELETE'; uid: string } = JSON.parse(
        evt.data
      );
      switch (payload.type) {
        case 'DELETE':
          setList((list) => list.filter((it) => it.uid !== payload.uid));
          break;
        case 'ADD': {
          try {
            // fetching latest records..., ignore sse notification
            if (last_active_time) return void 0;
            const entity = await getEntity(payload.uid);
            setList((list) => [entity, ...list]);
          } catch (e) {
            logger.error('Update list failed', e);
          }
          break;
        }
        default:
          logger.error(`Unknown notify type ${payload.type}`);
      }
    };
    const getLatestRecords = async () => {
      if (!last_active_time) return void 0;
      try {
        const records = await fetch(
          `${__ENDPOINT}?page=1&per_page=${10}&after=${last_active_time}`
        ).then<IEntity[]>((res) => (res.ok ? res.json() : []));
        if (records.length > 0) {
          logger.info(`updated ${records.length} records`);
          setList((list) => [...records, ...list]);
        }
      } finally {
        last_active_time = null;
      }
    };
    const connectSSE = () => {
      let retry = 0;
      const _sse = new EventSource(`${__ENDPOINT}/notify`);
      _sse.onopen = () => {
        logger.trace('sse connected');
      };
      _sse.onerror = () => {
        retry++;
        if (retry >= 3) {
          _sse.close();
          sse = null;
          logger.trace('More than 3 connection failures, sse closed');
        }
      };
      _sse.onmessage = handleSSEMessage;
      return _sse;
    };
    const handleVisibility = () => {
      const visibility = document.visibilityState;
      if (visibility === 'hidden') {
        timer = window.setTimeout(() => {
          if (!sse) return void 0;
          sse.close();
          sse = null;
          timer = null;
          last_active_time = Date.now();
          logger.trace('Inactive for more than 60s, sse closed');
        }, 6_0000);
        return void 0;
      }
      if (timer) window.clearTimeout(timer);
      if (sse) return void 0;
      // reconnect sse
      sse = connectSSE();
      getLatestRecords().catch(logger.error);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    sse = connectSSE();
    return () => {
      sse?.close();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);
  return (
    <section className="synclink-list-container">
      {(() => {
        if (!done) return <Spin className="synclink-loading" />;
        if (error)
          return (
            <div className="synclink-error">
              <AlertTriangleIcon />
              <p>{error.message}</p>
            </div>
          );
        return (
          <ul className="synclink-list">
            <UploadManager />
            {list.map((it) => (
              <SynclinkItem key={it.uid} it={it} />
            ))}
            {previous && (
              <li className="synclink-previous">
                <button onClick={loadPrevious}>Previous</button>
              </li>
            )}
          </ul>
        );
      })()}
    </section>
  );
});
