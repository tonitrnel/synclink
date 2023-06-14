import CalculateHashWorker from '../workers/calculate-hash.worker.ts?worker';
import { Logger } from '~/utils/logger.ts';
import { toHex } from './to-hex.ts';
import { wait } from './wait.ts';

type TransferData = ['result', string] | ['ready' | 'done'];
export const calculateHash = async (
  buffer: Promise<ArrayBuffer>,
  algorithm: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'
): Promise<string> => {
  return crypto.subtle
    .digest(algorithm, await buffer)
    .then((buffer) => toHex(buffer));
};

const logger = new Logger('calculateHash');

export const calculateHashFromStream = async (
  stream: ReadableStream<Uint8Array>,
  options: { onSpeedChange?: (speed: number) => void } = {}
): Promise<string> => {
  const worker = new CalculateHashWorker();
  // wait worker ready, worker registering message listener is not immediate and may lose message
  await (async () => {
    let ready = false;
    let error: Error | null = null;
    worker.addEventListener(
      'message',
      (evt: MessageEvent<TransferData>) => {
        if (evt.data[0] !== 'ready') return void 0;
        ready = true;
      },
      { once: true }
    );
    worker.addEventListener(
      'error',
      (err) => {
        error = new Error(err.message);
      },
      { once: true }
    );
    logger.debug('wait worker ready');
    while (!ready && !error) {
      worker.postMessage(['create']);
      await wait(100);
    }
    if (error) throw error;
  })();
  const reader = stream.getReader();
  const waitWorkerTask = (task: () => void) => {
    return new Promise<void>((resolve) => {
      worker.addEventListener(
        'message',
        (evt: MessageEvent<TransferData>) => {
          if (evt.data[0] === 'done') resolve();
        },
        { once: true }
      );
      task();
    });
  };
  let previous = Date.now();
  let interval = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value: view } = await reader.read();
    if (done) break;
    if (!view) throw new Error('Unexpected loss of stream value');
    const now = Date.now();
    interval += now - previous;
    if (interval > 1000) {
      options.onSpeedChange?.((view.length / (now - previous)) * 1000);
      interval = 0;
    }
    previous = now;
    await waitWorkerTask(() => {
      worker.postMessage(['update', view.buffer], [view.buffer]);
    });
  }
  logger.debug('Wait HASH result');
  return new Promise((resolve) => {
    worker.addEventListener('message', (evt: MessageEvent<TransferData>) => {
      if (evt.data[0] === 'result') {
        resolve(evt.data[1]);
        worker.terminate();
      }
    });
    worker.postMessage(['finalize']);
  });
};
