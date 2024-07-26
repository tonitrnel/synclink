import { FC } from 'react';
import { useEntityConsumer } from '../entity-provider';
import { Metadata } from './metadata';
import { Menu } from './menu';

export const VideoItem: FC = () => {
  const entity = useEntityConsumer();
  return (
    <>
      <video
        preload="metadata"
        controls
        className="cedasync-item-preview h-[280px] object-cover rounded max-w-full"
        controlsList="nodownload"
      >
        <source
          src={`${__ENDPOINT__}/api/file/${entity.uid}`}
          type={entity.type}
        />
      </video>

      <div className="mt-4 flex justify-between items-center">
        <Metadata entity={entity} />
        <Menu entity={entity} />
      </div>
    </>
  );
};
