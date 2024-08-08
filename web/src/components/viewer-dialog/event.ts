import { EventBus } from '~/utils/event-bus';

export type ViewerOptions = {
  resourceId: string; // 资源 ID
  subResourceId?: string; // 用于访问指定资源 ID 下路径或 hash 的资源
  filename: string;
  mimetype: string;
  extname?: string;
};

export const event = new EventBus<{
  open: ViewerOptions;
}>();

export const openViewer = (options: ViewerOptions) => {
  event.emit('open', options);
};
