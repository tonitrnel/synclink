import { FC, HTMLAttributes, memo } from 'react';
import { AudioPlayer } from '~/components/audio-player';
import { useEntity } from '../hooks/use-entity.ts';
import { Metadata } from './metadata';
import { Menu } from './menu';
import { clsx } from '~/utils/clsx.ts';
import { useCoordinator } from '../hooks/use-coordinator.ts';
import { RenderProps } from './type.ts';

/**
 * 音频项
 *
 * @tips 高度已知
 */
export const AudioItem: FC<HTMLAttributes<HTMLDivElement> & RenderProps> = memo(
  ({ visible, className, ...props }) => {
    const entity = useEntity();
    useCoordinator(entity.uid, true);
    return (
      <div className={clsx('', className)} {...props}>
        <AudioPlayer
          className="item-preview pt-2"
          src={`${__ENDPOINT__}/api/file/${entity.uid}`}
          title={entity.name}
          type={entity.type}
          visible={visible}
        />
        <div className="mt-4 flex items-center justify-between">
          <Metadata entity={entity} />
          <Menu entity={entity} />
        </div>
      </div>
    );
  },
);
