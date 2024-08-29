import { forwardRef, HTMLAttributes, memo, useMemo, useRef } from 'react';
import { UseEntity } from './hooks/use-entity.ts';
import relativeTime from 'dayjs/plugin/relativeTime';
import { IEntity } from '~/constants/types.ts';
import dayjs from 'dayjs';
import { clsx } from '~/utils/clsx.ts';
import { FolderItem } from './components/folder.tsx';
import { AudioItem } from './components/audio.tsx';
import { TextItem } from './components/text.tsx';
import { UnknownItem } from './components/unknown.tsx';
import { VideoItem } from './components/video.tsx';
import { ImageItem } from './components/image.tsx';
import { useLingui } from '@lingui/react';
import { useComposedRefs } from '~/utils/hooks/use-compose-refs.ts';
import { useIntersection } from './hooks/use-intersection.ts';
import './item.less';

dayjs.extend(relativeTime);

const ItemImpl = forwardRef<
  HTMLDivElement,
  {
    data: IEntity;
    className?: string;
  } & HTMLAttributes<HTMLDivElement>
>(({ data, className, ...props }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const composedRefs = useComposedRefs(containerRef, ref);
  const visible = useIntersection(containerRef);
  const i18n = useLingui();
  const file = useMemo(() => {
    const [category, format] = data.type.split('/');
    return {
      category,
      format,
    };
  }, [data]);
  const Render = useMemo(() => {
    switch (file.category) {
      case 'text':
        return TextItem;
      case 'image':
        return ImageItem;
      case 'video':
        return VideoItem;
      case 'audio':
        return AudioItem;
      case 'application':
        switch (file.format) {
          case 'x-tar':
            return FolderItem;
          default:
            return UnknownItem;
        }
      default:
        return UnknownItem;
    }
  }, [file.category, file.format]);
  const time = useMemo(() => {
    const created = dayjs(data.created);
    const diff = Math.abs(created.diff(dayjs(), 'days'));
    if (diff > 7) {
      return (
        <span>
          <span className="block text-lg font-bold text-gray-700">
            {created.format('MMM DD ')}
          </span>
          <span className="block text-sm text-gray-600">
            {created.format('A hh:mm')}
          </span>
        </span>
      );
    } else {
      return <span className="text-gray-600">{created.fromNow()}</span>;
    }
  }, [data.created]);
  const from = useMemo(() => {
    if (!data.ip || data.ip == '::1' || data.ip == '127.0.0.1')
      return <span className="ml-2">shared from unknown</span>;
    return (
      <span className="ml-2">
        <span className="text-gray-400">{i18n._('shared from')}</span>
        <span className="ml-1 text-gray-500">
          {data.ip_alias || data.ip || i18n._('unknown')}
        </span>
      </span>
    );
  }, [i18n, data.ip, data.ip_alias]);
  return (
    <div ref={composedRefs} className={clsx('item', className)} {...props}>
      <UseEntity value={data}>
        <div className="flex items-end bg-[#f6f8fa] px-3 py-4 text-sm pad:mb-2 pad:px-6">
          {time}
          {from}
        </div>
        <div className="flex-1 rounded bg-white p-5 px-3 shadow-sm outline-gray-400 pad:p-7 pad:pb-4">
          <Render visible={visible} />
        </div>
      </UseEntity>
    </div>
  );
});
export const Item = memo(ItemImpl);
