import { FC, HTMLAttributes, memo } from 'react';
import { AudioPlayer } from '~/components/audio-player';
import { Metadata } from './metadata';
import { Menu } from './menu';
import { clsx } from '~/utils/clsx.ts';
import { RenderProps } from './type.ts';
import { useEntry } from '../../../_hooks/use-entry.ts';

/**
 * 音频项
 *
 * @tips 高度已知
 */
export const AudioItem: FC<HTMLAttributes<HTMLDivElement> & RenderProps> = memo(
    ({ className, ...props }) => {
        const entry = useEntry();
        return (
            <div className={clsx('', className)} {...props}>
                <AudioPlayer
                    className="item-preview pt-2"
                    src={`${__ENDPOINT__}/api/file/${entry.id}`}
                    title={entry.name}
                    type={entry.mimetype}
                />
                <div className="mt-4 flex items-center justify-between">
                    <Metadata />
                    <Menu />
                </div>
            </div>
        );
    },
);
