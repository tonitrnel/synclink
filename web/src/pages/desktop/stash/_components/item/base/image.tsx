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
import { Metadata } from './metadata';
import { Menu } from './menu';
import { RenderProps } from './type.ts';
import { clsx } from '~/utils/clsx.ts';
import { useEntry } from '../../../_hooks/use-entry.ts';
import { patchFileMetadata } from '~/endpoints';

export const ImageItem: FC<HTMLAttributes<HTMLDivElement> & RenderProps> = memo(
    ({ className, ...props }) => {
        const entry = useEntry();
        const isMobile = useMediaQuery(useMediaQuery.MOBILE_QUERY);
        const [{ metadata }, setState] = useState(() => ({
            metadata:
                entry.metadata?.type == 'image' ? entry.metadata : undefined,
        }));
        const id = useMemo(() => Date.now().toString(36), []);
        useEffect(() => {
            if (!metadata || entry.mimetype == 'image/svg+xml') return void 0;
            const lightbox = new PhotoSwipeLightbox({
                pswpModule: () => import('photoswipe'),
                initialZoomLevel: (zoomLevelObject) => {
                    return isMobile
                        ? zoomLevelObject.vFill
                        : zoomLevelObject.fit;
                },
                gallery: `#lightbox-${id}`,
                children: 'a',
            });
            lightbox.init();
            return () => {
                lightbox.destroy();
            };
        }, [metadata, id, isMobile, entry.mimetype]);
        const onLoad = useCallback(
            (evt: SyntheticEvent<HTMLImageElement>) => {
                if (entry.metadata?.type == 'image') {
                    return;
                }
                // 或许这里可以将 metadata 更新到服务器？
                patchFileMetadata({
                    path: {
                        id: entry.id,
                    },
                    body: {
                        type: 'image',
                        width: evt.currentTarget.naturalWidth,
                        height: evt.currentTarget.naturalHeight,
                    },
                }).catch(console.warn);
                withProduce(setState, (draft) => {
                    draft.metadata = {
                        type: 'image',
                        width: evt.currentTarget.naturalWidth,
                        height: evt.currentTarget.naturalHeight,
                    };
                });
            },
            [entry.id, entry.metadata?.type],
        );
        const onError = useCallback(() => {
            console.warn('Error while loading image', entry.id);
        }, [entry.id]);
        return (
            <div className={clsx('leading-0', className)} {...props}>
                <figure
                    className="item-preview m-0 mx-auto inline-block overflow-hidden text-left"
                    id={`lightbox-${id}`}
                >
                    <a
                        href={`${__ENDPOINT__}/api/file/${entry.id}`}
                        data-pswp-src={`${__ENDPOINT__}/api/file/${entry.id}`}
                        data-pswp-width={metadata?.width}
                        data-pswp-height={metadata?.height}
                        target="_blank"
                        className="block w-fit cursor-zoom-in"
                    >
                        <img
                            className="rounded-2xl object-cover object-center"
                            src={`${__ENDPOINT__}/api/file/${entry.id}?thumbnail-prefer`}
                            alt={entry.name}
                            data-id={entry.id}
                            onLoad={onLoad}
                            onError={onError}
                            style={{
                                height: metadata?.thumbnail_height
                                    ? `${metadata.thumbnail_height}px`
                                    : 220,
                                width: metadata?.thumbnail_width
                                    ? `${metadata.thumbnail_width}px`
                                    : undefined,
                            }}
                        />
                    </a>
                    <figcaption className="mt-2 w-full truncate overflow-hidden text-right text-sm text-gray-500 italic">
                        {entry.name}
                    </figcaption>
                </figure>

                <div className="mt-4 flex items-center justify-between">
                    <Metadata />
                    <Menu />
                </div>
            </div>
        );
    },
);
