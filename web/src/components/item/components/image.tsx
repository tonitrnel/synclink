import PhotoSwipeLightbox from 'photoswipe/lightbox';
import {
  FC,
  memo,
  useState,
  useMemo,
  useEffect,
  useCallback,
  SyntheticEvent,
  HTMLAttributes,
} from 'react';
import { useMediaQuery } from '~/utils/hooks/use-media-query';
import { withProduce } from '~/utils/with-produce';
import { useEntity } from '../hooks/use-entity.ts';
import { Metadata } from './metadata';
import { Menu } from './menu';
import { clsx } from '~/utils/clsx.ts';
import { useCoordinator } from '../hooks/use-coordinator.ts';
import { RenderProps } from './type.ts';

export const ImageItem: FC<HTMLAttributes<HTMLDivElement> & RenderProps> = memo(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ({ visible, className, ...props }) => {
    const entity = useEntity();
    const isMobile = useMediaQuery(useMediaQuery.MOBILE_QUERY);
    const [{ loaded, metadata }, setState] = useState(() => ({
      loaded: false,
      metadata: entity.metadata,
    }));
    const coordinatorReport = useCoordinator(entity.uid);
    const id = useMemo(() => Date.now().toString(36), []);
    useEffect(() => {
      if (!metadata || entity.type == 'image/svg+xml') return void 0;
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
    }, [metadata, id, isMobile, entity.type]);
    const onLoad = useCallback(
      (evt: SyntheticEvent<HTMLImageElement>) => {
        withProduce(setState, (draft) => {
          draft.loaded = true;
          if (!draft.metadata) {
            draft.metadata = {
              width: evt.currentTarget.naturalWidth,
              height: evt.currentTarget.naturalHeight,
            };
          }
        });
        coordinatorReport();
      },
      [coordinatorReport],
    );
    const onError = useCallback(() => {
      coordinatorReport();
    }, [coordinatorReport]);
    useEffect(() => {
      if (!metadata?.thumbnail_height) return void 0;
      coordinatorReport();
    }, [coordinatorReport, metadata?.thumbnail_height]);
    return (
      <div className={clsx('', className)} {...props}>
        <figure
          className="item-preview m-0 max-w-max overflow-hidden text-left"
          id={`lightbox-${id}`}
        >
          <a
            href={`${__ENDPOINT__}/api/file/${entity.uid}`}
            data-pswp-src={`${__ENDPOINT__}/api/file/${entity.uid}`}
            data-pswp-width={metadata?.width}
            data-pswp-height={metadata?.height}
            target="_blank"
            className="block w-fit cursor-zoom-in"
          >
            <img
              className="max-h-[20rem] rounded object-cover object-center"
              src={`${__ENDPOINT__}/api/file/${entity.uid}?thumbnail-prefer`}
              alt={entity.name}
              data-id={entity.uid}
              onLoad={onLoad}
              onError={onError}
              style={{
                height: metadata?.thumbnail_height
                  ? `${metadata.thumbnail_height}px`
                  : undefined,
                width: metadata?.thumbnail_width
                  ? `${metadata.thumbnail_width}px`
                  : undefined,
              }}
            />
          </a>
          {loaded && (
            <figcaption className="mt-2 w-full overflow-hidden truncate text-right text-sm italic text-gray-500">
              {entity.name}
            </figcaption>
          )}
        </figure>

        <div className="mt-4 flex items-center justify-between">
          <Metadata entity={entity} />
          <Menu entity={entity} />
        </div>
      </div>
    );
  },
);
