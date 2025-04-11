export const wait = (ms: number, signal?: AbortSignal) => {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (signal?.aborted) return void 0;
      resolve();
    }, ms);
    signal?.addEventListener('abort', () => clearTimeout(timer));
  });
};

export class TimeoutError extends Error {
  name = 'TimeoutError';
}

export const timeout = (ms: number, signal?: AbortSignal) => {
  return new Promise<void>((_, reject) => {
    const timer = setTimeout(() => {
      if (signal?.aborted) return void 0;
      reject(new TimeoutError());
    }, ms);
    signal?.addEventListener('abort', () => clearTimeout(timer));
  });
};
