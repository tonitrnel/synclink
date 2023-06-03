import { Sha256Binding } from 'sha256-binding';
import { toHex } from '../utils/to-hex.ts';

type TransferData = ['update', ArrayBuffer] | ['create' | 'finalize'];

let hasher: Sha256Binding | null = null;

console.log('worker loaded');
self.addEventListener('message', (evt: MessageEvent<TransferData>) => {
  switch (evt.data[0]) {
    case 'create':
      console.log(`[worker]: rec create message`);
      hasher = Sha256Binding.create();
      console.log(`[worker]: hasher ready`);
      self.postMessage(['ready']);
      return void 0;
    case 'finalize':
      console.log(`[worker]: rec finalize`);
      if (!hasher) return void 0;
      self.postMessage(['result', toHex(hasher.finalize())]);
      console.log(`[worker]: handled finalize`);
      self.close();
      return void 0;
    case 'update':
      if (!hasher) return void 0;
      hasher.update(new Uint8Array(evt.data[1]));
      return void 0;
    default:
      console.log(`[worker]: unknown host message type: "${evt.data[0]}"`);
  }
});
