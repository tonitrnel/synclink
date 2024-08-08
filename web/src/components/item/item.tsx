import { FC, memo, useMemo } from 'react';
import { EntityProvider } from './entity-provider.ts';
import relativeTime from 'dayjs/plugin/relativeTime';
import { IEntity } from '~/constants/types.ts';
import dayjs from 'dayjs';
import { t } from '@lingui/macro';
import { clsx } from '~/utils/clsx.ts';
import { FolderItem } from './components/folder.tsx';
import { AudioItem } from './components/audio.tsx';
import { TextItem } from './components/text.tsx';
import { UnknownItem } from './components/unknown.tsx';
import { VideoItem } from './components/video.tsx';
import { ImageItem } from './components/image.tsx';
import './item.less';

dayjs.extend(relativeTime);

export const Item: FC<{
  it: IEntity;
  className?: string;
}> = memo(({ it, className }) => {
  const file = useMemo(() => {
    const [category, format] = it.type.split('/');
    return {
      category,
      format,
    };
  }, [it]);
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
    const created = dayjs(it.created);
    const diff = Math.abs(created.diff(dayjs(), 'days'));
    if (diff > 7) {
      return (
        <span>
          <span className="block text-lg text-gray-700 font-bold">
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
  }, [it.created]);
  const from = useMemo(() => {
    if (!it.ip || it.ip == '::1' || it.ip == '127.0.0.1')
      return <span className="ml-2">shared from unknown</span>;
    return (
      <span className="ml-2">
        <span className="text-gray-400">{t`shared from`}</span>
        <span className="ml-1 text-gray-500">
          {it.ip_alias || it.ip || 'unknown'}
        </span>
      </span>
    );
  }, [it.ip, it.ip_alias]);
  return (
    <EntityProvider value={it}>
      <li
        className={clsx('cedasync-item', className)}
        data-uid={it.uid}
        key={it.uid}
      >
        <div className="pad:mb-2 text-sm flex items-end bg-[#f6f8fa] px-3 pad:px-6 py-4">
          {time}
          {from}
        </div>
        <div className="flex-1 bg-white shadow-sm rounded p-5 px-3 pad:p-7 pad:pb-4 outline-gray-400">
          <Render />
        </div>
      </li>
    </EntityProvider>
  );
});
