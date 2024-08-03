import PhotoSwipeLightbox from 'photoswipe/lightbox';
import {
  FC,
  memo,
  useState,
  useMemo,
  useEffect,
  useCallback,
  SyntheticEvent,
} from 'react';
import { useMediaQuery } from '~/utils/hooks/use-media-query';
import { withProduce } from '~/utils/with-produce';
import { useEntityConsumer } from '../entity-provider';
import { Metadata } from './metadata';
import { Menu } from './menu';

export const ImageItem: FC = memo(() => {
  const entity = useEntityConsumer();
  const isMobile = useMediaQuery(useMediaQuery.MOBILE_QUERY);
  const [{ loaded, metadata }, setState] = useState(() => ({
    loaded: false,
    metadata: entity.metadata,
  }));
  const id = useMemo(() => Date.now().toString(36), []);
  useEffect(() => {
    if (!metadata) return void 0;
    const lightbox = new PhotoSwipeLightbox({
      pswpModule: () => import('photoswipe'),
      initialZoomLevel: (zoomLevelObject) => {
        return isMobile ? zoomLevelObject.vFill : zoomLevelObject.fit;
      },
      gallery: `#lightbox-${id}`,
      children: 'a',
    });
    lightbox.init();
    return () => {
      lightbox.destroy();
    };
  }, [metadata, id, isMobile]);
  const onLoad = useCallback((evt: SyntheticEvent<HTMLImageElement>) => {
    withProduce(setState, (draft) => {
      draft.loaded = true;
      if (!draft.metadata) {
        draft.metadata = {
          width: evt.currentTarget.naturalWidth,
          height: evt.currentTarget.naturalHeight,
        };
      }
    });
  }, []);
  return (
    <>
      <figure
        className="cedasync-item-preview text-left m-0 overflow-hidden max-w-max"
        id={`lightbox-${id}`}
      >
        <a
          href={`${__ENDPOINT__}/api/file/${entity.uid}`}
          data-pswp-src={`${__ENDPOINT__}/api/file/${entity.uid}`}
          data-pswp-width={metadata?.width}
          data-pswp-height={metadata?.height}
          target="_blank"
          className="cursor-zoom-in block w-fit"
        >
          <img
            className="rounded max-h-[360px] object-cover object-center"
            src={`${__ENDPOINT__}/api/file/${entity.uid}?thumbnail-prefer`}
            alt={entity.name}
            data-id={entity.uid}
            onLoad={onLoad}
          />
        </a>
        {loaded && (
          <figcaption className="italic text-gray-500 text-sm mt-2 text-right overflow-hidden truncate w-full">
            {entity.name}
          </figcaption>
        )}
      </figure>

      <div className="mt-4 flex justify-between items-center">
        <Metadata entity={entity} />
        <Menu entity={entity} />
      </div>
    </>
  );
});
