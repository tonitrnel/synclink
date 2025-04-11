import { FC, HTMLAttributes, memo, useCallback } from 'react';
import { useEntity } from '../hooks/use-entity.ts';
import { Metadata } from './metadata';
import { Menu } from './menu';
import { clsx } from '~/utils/clsx.ts';
import { useCoordinator } from '../hooks/use-coordinator.ts';
import { RenderProps } from './type.ts';

/**
 * 视频项
 *
 * @tips 高度已知
 */
export const VideoItem: FC<HTMLAttributes<HTMLDivElement> & RenderProps> = memo(
  ({ visible, className, ...props }) => {
    const entity = useEntity();
    const coordinatorReport = useCoordinator(entity.uid, !visible);
    const onLoadedMetadata = useCallback(() => {
      coordinatorReport();
    }, [coordinatorReport]);
    return (
      <div className={clsx('', className)} {...props}>
        <video
          preload={visible ? 'metadata' : 'none'}
          controls
          className="h-[24rem] min-h-0 w-auto min-w-0 flex-1 rounded object-cover"
          controlsList="nodownload"
          onLoadedMetadata={onLoadedMetadata}
        >
          <source
            src={`${__ENDPOINT__}/api/file/${entity.uid}`}
            type={entity.type}
          />
        </video>

        <div className="mt-4 flex items-center justify-between">
          <Metadata entity={entity} />
          <Menu entity={entity} />
        </div>
      </div>
    );
  },
);
