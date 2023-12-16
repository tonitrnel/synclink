import { Sha256Binding } from 'sha256-binding';
import { toHex } from '../utils/to-hex.ts';

type TransferData = ['update', ArrayBuffer] | ['create' | 'finalize'];

let hasher: Sha256Binding | null = null;

console.log('worker loaded');

self.addEventListener('message', (evt: MessageEvent<TransferData>) => {
  switch (evt.data[0]) {
    case 'create':
      hasher = Sha256Binding.create();
      self.postMessage(['ready']);
      console.log(`[worker]: hasher ready`);
      return void 0;
    case 'update':
      if (!hasher) return void 0;
      hasher.update(new Uint8Array(evt.data[1]));
      self.postMessage(['done']);
      return void 0;
    case 'finalize':
      if (!hasher) return void 0;
      self.postMessage(['result', toHex(hasher.finalize())]);
      self.close();
      return void 0;
    default:
      console.log(`[worker]: unknown host message type: "${evt.data[0]}"`);
  }
});
