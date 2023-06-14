import { useCallback, useEffect, useRef, useState } from 'react';
import { Logger } from '~/utils/logger.ts';

const logger = new Logger('useGet');

export const useGet = <T>(
  url: string,
  transformer: (response: Response) => Promise<T>
): [
  T | undefined,
  {
    done: boolean;
    error?: Error;
    refresh: () => Promise<void>;
  }
] => {
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<T>();
  const [error, setError] = useState<Error>();
  const transformerRef = useRef(transformer);
  const send = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        setError(new Error(res.statusText));
        setResult(void 0);
      } else {
        setError(void 0);
        setResult(await transformerRef.current(res));
      }
    } catch (e) {
      if (e instanceof Error) {
        setError(new Error(e.message));
      } else {
        setError(new Error(String(e)));
      }
      setResult(void 0);
    } finally {
      setDone(true);
    }
  }, [url]);
  useEffect(() => {
    send().catch(logger.error);
  }, [send]);
  transformerRef.current = transformer;
  return [
    result,
    {
      error,
      done,
      refresh: send,
    },
  ];
};
