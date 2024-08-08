import { FC, HTMLAttributes, memo } from 'react';
import { AudioPlayer } from '~/components/audio-player';
import { useEntityConsumer } from '../entity-provider';
import { Metadata } from './metadata';
import { Menu } from './menu';
import { clsx } from '~/utils/clsx.ts';

export const AudioItem: FC<HTMLAttributes<HTMLDivElement>> = memo(
  ({ className, ...props }) => {
    const entity = useEntityConsumer();
    return (
      <div className={clsx('', className)} {...props}>
        <AudioPlayer
          className="cedasync-item-preview pt-2"
          src={`${__ENDPOINT__}/api/file/${entity.uid}`}
          title={entity.name}
          type={entity.type}
        />
        <div className="mt-4 flex justify-between items-center">
          <Metadata entity={entity} />
          <Menu entity={entity} />
        </div>
      </div>
    );
  },
);
