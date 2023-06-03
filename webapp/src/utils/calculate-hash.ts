import CalculateHashWorker from '../workers/calculate-hash.worker.ts?worker';
import { formatBytes } from './format-bytes.ts';
import { toHex } from './to-hex.ts';
import { wait } from './wait.ts';

type TransferData = ['result', string] | ['ready'];
export const calculateHash = async (
  buffer: Promise<ArrayBuffer>,
  algorithm: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'
): Promise<string> => {
  return crypto.subtle
    .digest(algorithm, await buffer)
    .then((buffer) => toHex(buffer));
};
export const calculateHashFromStream = async (
  stream: ReadableStream
): Promise<string> => {
  const worker = new CalculateHashWorker();
  const start = performance.now();
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
    console.log('wait worker ready');
    while (!ready && !error) {
      worker.postMessage(['create']);
      await wait(100);
    }
    if (error) throw error;
  })();
  const reader = stream.getReader();
  let speed = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) throw new Error('Stream read error');
    speed = Math.max(value.length, speed);
    worker.postMessage(['update', value.buffer], [value.buffer]);
  }
  return new Promise((resolve) => {
    worker.addEventListener('message', (evt: MessageEvent<TransferData>) => {
      if (evt.data[0] === 'result') {
        resolve(evt.data[1]);
        console.log(
          `calculate hash, speed ${formatBytes(speed)} in ${(
            performance.now() - start
          ).toFixed(2)}ms`
        );
        worker.terminate();
      } else {
        console.warn(`unknown worker message type: ${evt.data[0]}`);
      }
    });
    worker.postMessage(['finalize']);
  });
};
