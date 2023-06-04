import { FC, memo, useEffect, useState } from 'react';
import { ReactComponent as AlertTriangleIcon } from '~/assets/alert-triangle.svg';
import { UploadManager } from '~/components/upload-manager';
import { SynclinkItem } from '~/components/item';
import { Spin } from '~/components/spin';
import { useGet } from '~/utils/hooks/use-get.ts';
import { IEntity } from '~/constants/types.ts';
import './list.css';

const getEntity = async (uid: string) => {
  return fetch(
    `${import.meta.env.VITE_APP_ENDPOINT}/${uid}/metadata`
  ).then<IEntity>((res) => res.json());
};

export const List: FC = memo(() => {
  const [list, setList] = useState<IEntity[]>([]);
  const [, { done, error }] = useGet<void>(
    import.meta.env.VITE_APP_ENDPOINT,
    async (res) => {
      setList(await res.json());
    }
  );
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
            console.error('Update list failed', e);
          }
          break;
        }
        default:
          console.error(`Unknown notify type ${payload.type}`);
      }
    };
    const getLatestRecords = async () => {
      if (!last_active_time) return void 0;
      try {
        const records = await fetch(
          `${import.meta.env.VITE_APP_ENDPOINT}?after=${last_active_time}`
        ).then<IEntity[]>((res) => (res.ok ? res.json() : []));
        if (records.length > 0) {
          console.log(`updated ${records.length} records`);
          setList((list) => [...records, ...list]);
        }
      } finally {
        last_active_time = null;
      }
    };
    const connectSSE = () => {
      let retry = 0;
      const _sse = new EventSource(
        `${import.meta.env.VITE_APP_ENDPOINT}/notify`
      );
      _sse.onopen = () => {
        console.log('sse connected');
      };
      _sse.onerror = () => {
        retry++;
        if (retry >= 3) {
          _sse.close();
          sse = null;
          console.log('More than 3 connection failures, sse closed');
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
          console.log('Inactive for more than 60s, sse closed');
        }, 6_000);
        return void 0;
      }
      if (timer) window.clearTimeout(timer);
      if (sse) return void 0;
      // reconnect sse
      sse = connectSSE();
      getLatestRecords().catch(console.error);
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
          </ul>
        );
      })()}
    </section>
  );
});
