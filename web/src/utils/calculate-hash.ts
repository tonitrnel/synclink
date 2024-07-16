import CalculateHashWorker from '../workers/calculate-hash.worker.ts?worker';
import { Logger } from '~/utils/logger.ts';
import { toHex } from './to-hex.ts';
import { wait } from './wait.ts';
import { featureCheck } from '~/utils/feature-check.ts';
import { type DirEntry } from '~/constants/types.ts';

type TransferData = ['result', string] | ['ready' | 'done'];
export const calculateHash = async (
  buffer: Promise<ArrayBuffer>,
  algorithm: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512',
): Promise<string> => {
  featureCheck('subtle');
  return crypto.subtle
    .digest(algorithm, await buffer)
    .then((buffer) => toHex(buffer));
};

const logger = new Logger('calculateHash');

export type CalculateHashOptions = {
  signal?: AbortSignal;
  onReady?(): void;
  onSpeedChange?(speed: number): void;
  onProgressChange?(loaded: number): void;
};
type ProgressTracker = {
  previous: number;
  interval: number;
  loaded: number;
};

const requestHashWorker = async (
  options: CalculateHashOptions,
): Promise<Worker> => {
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
      { once: true },
    );
    worker.addEventListener(
      'error',
      (err) => {
        error = new Error(err.message);
      },
      { once: true },
    );
    logger.debug('wait worker ready');
    while (!ready && !error) {
      worker.postMessage(['create']);
      await wait(100);
    }
    if (error) throw error;
  })();
  if (options.signal?.aborted) {
    worker.terminate();
    throw options.signal.reason;
  }
  options.onReady?.();
  return worker;
};

const runTask = (
  { worker, options }: { worker: Worker; options: CalculateHashOptions },
  task: () => void,
) => {
  return new Promise<void>((resolve, reject) => {
    if (options.signal?.aborted) {
      worker.terminate();
      reject(options.signal.reason);
      return void 0;
    }
    worker.addEventListener(
      'message',
      (evt: MessageEvent<TransferData>) => {
        if (evt.data[0] === 'done') resolve();
      },
      { once: true },
    );
    task();
  });
};

const finalize = (worker: Worker): Promise<string> => {
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

const calculateFileHash = async (
  worker: Worker,
  options: CalculateHashOptions,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  progressTracker: ProgressTracker,
) => {
  while (true) {
    const { done, value: view } = await reader.read();
    if (done) break;
    if (!view) throw new Error('Unexpected loss of stream value');
    // update progress tracker
    {
      const now = Date.now();
      progressTracker.interval += now - progressTracker.previous;
      if (progressTracker.interval > 1000) {
        options.onSpeedChange?.(
          (view.length / (now - progressTracker.previous)) * 1000,
        );
        progressTracker.interval = 0;
      }
      progressTracker.previous = now;
    }
    await runTask({ worker, options }, () => {
      progressTracker.loaded += view.buffer.byteLength;
      options.onProgressChange?.(progressTracker.loaded);
      worker.postMessage(['update', view.buffer], [view.buffer]);
    });
  }
};

export const calculateHashFromStream = async (
  stream: ReadableStream<Uint8Array>,
  options: CalculateHashOptions = {},
): Promise<string> => {
  const worker = await requestHashWorker(options);
  const reader = stream.getReader();
  const progressTracker: ProgressTracker = {
    previous: Date.now(),
    interval: 0,
    loaded: 0,
  };
  await calculateFileHash(worker, options, reader, progressTracker);
  logger.debug('Wait HASH result');
  return finalize(worker);
};

export const calculateHashFromDirectory = async (
  entries: readonly DirEntry[],
  options: CalculateHashOptions = {},
) => {
  const worker = await requestHashWorker(options);
  const progressTracker: ProgressTracker = {
    previous: Date.now(),
    interval: 0,
    loaded: 0,
  };
  const stack = entries.toReversed();
  while (stack.length > 0) {
    const entry = stack.pop()!;
    await runTask({ worker, options }, () => {
      const nameBytes = new TextEncoder().encode(entry.path);
      progressTracker.loaded += nameBytes.length;
      worker.postMessage(['update', nameBytes.buffer], [nameBytes.buffer]);
    });
    if (entry.type == 'directory') {
      stack.push(...entry.children.toReversed());
    } else {
      const reader = entry.file.stream().getReader();
      await calculateFileHash(worker, options, reader, progressTracker);
    }
  }
  return finalize(worker);
};
