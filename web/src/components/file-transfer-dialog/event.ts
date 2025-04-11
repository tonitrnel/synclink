import { EventBus } from '~/utils/event-bus';

export type FileTransferOptions = {
  mode: 'sender' | 'receiver';
  id?: string;
};

export const event = new EventBus<{
  open: FileTransferOptions;
}>();

export const openFileTransfer = (options: FileTransferOptions) => {
  event.emit('open', options);
};
