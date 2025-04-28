import { FC, HTMLAttributes, memo } from 'react';
import { Metadata } from './metadata';
import { Menu } from './menu';
import { clsx } from '~/utils/clsx.ts';
import { RenderProps } from './type.ts';
import { useEntry } from '../../../_hooks/use-entry.ts';

/**
 * 视频项
 *
 * @tips 高度已知
 */
export const VideoItem: FC<HTMLAttributes<HTMLDivElement> & RenderProps> = memo(
    ({ className, ...props }) => {
        const entry = useEntry();
        return (
            <div className={clsx('', className)} {...props}>
                <video
                    preload="metadata"
                    controls
                    className="h-[24rem] min-h-0 w-auto min-w-0 flex-1 rounded object-cover"
                    controlsList="nodownload"
                >
                    <source
                        src={`${__ENDPOINT__}/api/file/${entry.id}`}
                        type={entry.mimetype}
                    />
                </video>

                <div className="mt-4 flex items-center justify-between">
                    <Metadata />
                    <Menu />
                </div>
            </div>
        );
    },
);
