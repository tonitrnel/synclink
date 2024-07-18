import {
  FC,
  memo,
  MouseEvent,
  ReactNode,
  SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { EntityProvider, useEntityConsumer } from './entity-provider.ts';
import { AudioPlayer } from '~/components/audio-player';
import { executeAsyncTask } from '~/utils/execute-async-task.ts';
import relativeTime from 'dayjs/plugin/relativeTime';
import { formatBytes } from '~/utils/format-bytes.ts';
import { IEntity } from '~/constants/types.ts';
import { copy } from '~/utils/copy.ts';
import {
  DownloadCloudIcon,
  Share2Icon,
  EraserIcon,
  CopyIcon,
  FolderIcon,
  FileIcon,
} from 'icons';
import dayjs from 'dayjs';
import { t } from '@lingui/macro';
import { withProduce } from '~/utils/with-produce.ts';
import { clsx } from '~/utils/clsx.ts';
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import { useGetDirectory, useGetFileContent, InferResponse } from '~/endpoints';
import { useSnackbar } from '~/components/snackbar';
import type { TreeNode } from 'primereact/treenode';
import { useMediaQuery } from '~/utils/hooks/use-media-query.ts';
import { toTreeByPath } from '~/utils/to-tree-by-path.ts';
import { TreeTable } from 'primereact/treetable';
import { Column } from 'primereact/column';
import './item.less';

dayjs.extend(relativeTime);

const SUPPORTED_SHARE =
  typeof window.navigator.share === 'function' &&
  typeof window.navigator.canShare === 'function';

type CustomMenu = {
  key: string;
  component: ReactNode;
  event: (evt: MouseEvent<HTMLButtonElement>) => void;
};
const SynclinkItemMenu: FC<{
  entity: IEntity;
  features?: Array<
    | 'previewable'
    | 'downloadable'
    | 'deletable'
    | 'shareable'
    | false
    | undefined
  >;
  slots?: Array<CustomMenu | false | undefined>;
}> = memo(
  ({
    entity,
    features = ['downloadable', 'deletable', 'shareable'],
    slots = [],
  }) => {
    const snackbar = useSnackbar();
    const onDelete = useMemo(
      () =>
        executeAsyncTask(async (uid: string) => {
          await fetch(`${__ENDPOINT__}/api/file/${uid}`, {
            method: 'DELETE',
          });
          document.body.dispatchEvent(new CustomEvent('refresh-stats'));
        }),
      [],
    );
    const onShare = useMemo(
      () =>
        executeAsyncTask(async (entity: IEntity) => {
          if (
            typeof navigator.share !== 'function' ||
            !('canShare' in navigator)
          )
            return void 0;
          const data = await (async (): Promise<ShareData | void> => {
            // 5 MB
            if (entity.size > 5_242_880) {
              return {
                title: entity.name,
                url: `${__ENDPOINT__}/api/file/${entity.uid}`,
              };
            }
            if (entity.type.startsWith('text/')) {
              return {
                title: entity.name,
                text: await fetch(
                  `${__ENDPOINT__}/api/file/${entity.uid}`,
                ).then((res) => res.text()),
              };
            }
            return {
              title: entity.name,
              files: [
                await fetch(`${__ENDPOINT__}/api/file/${entity.uid}`)
                  .then((res) => res.blob())
                  .then(
                    (blob) =>
                      new File([blob], entity.name, { type: entity.type }),
                  ),
              ],
            };
          })();
          try {
            if (data && navigator.canShare(data)) await navigator.share(data);
            else {
              snackbar.enqueueSnackbar({
                message: t`can't share this file`,
                variant: 'warning',
              });
            }
          } catch (e) {
            snackbar.enqueueSnackbar({
              message: e instanceof Error ? e.message : String(e),
              variant: 'error',
            });
          }
        }),
      [snackbar],
    );
    const onDownload = useCallback(() => {
      window.open(`${__ENDPOINT__}/api/file/${entity.uid}?raw`, '_blank');
    }, [entity.uid]);
    return (
      <div className="flex gap-3 items-center whitespace-nowrap text-sm">
        {slots
          .filter((it): it is CustomMenu => typeof it === 'object')
          .map((it) => (
            <button
              key={it.key}
              className="synclink-item-link"
              onClick={it.event}
            >
              {it.component}
            </button>
          ))}
        {features.includes('downloadable') && (
          <button className="synclink-item-link" onClick={onDownload}>
            <DownloadCloudIcon className="w-4 h-4" />
            <span className="capitalize">{t`download`}</span>
          </button>
        )}
        {features.includes('shareable') && SUPPORTED_SHARE && (
          <button
            className="synclink-item-link"
            onClick={() => onShare(entity)}
          >
            <Share2Icon className="w-4 h-4" />
            <span className="capitalize">{t`share`}</span>
          </button>
        )}
        {features.includes('deletable') && (
          <button
            className="synclink-item-link"
            onClick={() => onDelete(entity.uid)}
          >
            <EraserIcon className="w-4 h-4" />
            <span className="capitalize">{t`delete`}</span>
          </button>
        )}
      </div>
    );
  },
);
const SynclinkItemMetadata: FC<{
  entity: IEntity;
  features?: Array<'type' | 'size'>;
}> = memo(({ entity, features = ['type', 'size'] }) => {
  return (
    <div className="flex flex-1 gap-2 items-center min-w-0 h-4">
      {features.includes('size') && (
        <span className="text-gray-800 leading-none whitespace-nowrap text-sm">
          {formatBytes(entity.size)}
        </span>
      )}
      {features.includes('type') && (
        <span className="text-gray-400 block leading-none truncate text-sm pr-4 pad:pr-10">
          {entity.type}
        </span>
      )}
    </div>
  );
});

/* === Preview Item === */

const TextItem: FC = memo(() => {
  const entity = useEntityConsumer();
  const [unconfirmed, setUnconfirmed] = useState(() => entity.size > 4096);
  const {
    data: content,
    pending: loading,
    error,
  } = useGetFileContent({
    path: {
      id: entity.uid,
    },
    enabled: !unconfirmed,
  });
  const [{ expandable, expanded }, setExpanded] = useState(() => ({
    expandable: false,
    expanded: false,
  }));
  // const handleDoubleClick = useCallback<
  //   MouseEventHandler<HTMLParagraphElement>
  // >((evt) => {
  //   evt.preventDefault();
  //   evt.stopPropagation();
  //   const selection = window.getSelection();
  //
  //   if (selection) {
  //     selection.removeAllRanges();
  //     const range = document.createRange();
  //     range.selectNodeContents(evt.currentTarget);
  //     selection.addRange(range);
  //   }
  // }, []);
  const copyButton = useMemo<CustomMenu>(
    () => ({
      key: 'copy',
      event: async () => {
        if (!content) return void 0;
        await copy(content);
      },
      component: (
        <>
          <CopyIcon className="w-5 h-5" />
          <span className="capitalize">{t`copy`}</span>
        </>
      ),
    }),
    [content],
  );
  const html = useMemo(() => {
    if (!content) return '';
    let text = content;
    if (text.length > 256 && !expanded) {
      withProduce(setExpanded, (draft) => void (draft.expandable = true));
      text = text.substring(0, 256) + '...';
    }
    {
      const textNode = document.createTextNode(text);
      const p = document.createElement('p');
      p.appendChild(textNode);
      text = p.innerHTML;
      // noinspection HtmlUnknownTarget
      text = text.replace(
        /(?<href>https?:\/\/[\w-_]+(?:\.\w+)+[^\s)]+)/gm,
        `<a class='underline' target='_blank' referrerpolicy='no-referrer' href="$<href>">$<href><svg aria-hidden="true" fill="none" focusable="false" height="1em" shape-rendering="geometricPrecision" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" class="inline ml-1 mb-0.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"></path><path d="M15 3h6v6"></path><path d="M10 14L21 3"></path></svg></a>`,
      );
    }
    return text;
  }, [content, expanded]);
  const onContinue = useCallback(() => {
    withProduce(setExpanded, (draft) => void (draft.expanded = true));
  }, []);
  return (
    <>
      {unconfirmed || (loading && !error) ? (
        <p className="mt-0 text-gray-600 italic">
          <span>
            The content of this text is a bit large, so it will not be actively
            load.
          </span>
          <button
            onClick={() => setUnconfirmed(false)}
            className="block p-0 m-0 mt-2 leading-none bg-transparent italic outline-0 border-0 text-gray-600 underline cursor-pointer"
          >
            {loading ? <span>loading</span> : <span>load content</span>}
            {loading && <span className="ani_dot">...</span>}
          </button>
        </p>
      ) : error ? (
        <p className="text-error-main">{String(error)}</p>
      ) : (
        <p
          className={clsx(
            'w-full whitespace-break-spaces break-words text-gray-900 mt-0 min-h-[32px] italic leading-relaxed',
          )}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      {!expanded && expandable && (
        <button
          className="border-none bg-transparent underline italic p-0 text-gray-600 cursor-pointer"
          onClick={onContinue}
        >{t`continue read`}</button>
      )}

      <div className="mt-4 flex justify-between items-center">
        <SynclinkItemMetadata entity={entity} />
        <SynclinkItemMenu
          entity={entity}
          features={[unconfirmed && 'downloadable', 'shareable', 'deletable']}
          slots={[!unconfirmed && copyButton]}
        />
      </div>
    </>
  );
});
const FigureItem: FC = memo(() => {
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
        className="synclink-item-preview text-left m-0 overflow-hidden max-w-max"
        id={`lightbox-${id}`}
      >
        <a
          href={`${__ENDPOINT__}/api/file/${entity.uid}`}
          data-pswp-src={`${__ENDPOINT__}/api/file/${entity.uid}`}
          data-pswp-width={metadata?.width}
          data-pswp-height={metadata?.height}
          target="_blank"
          className="cursor-zoom-in"
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
        <SynclinkItemMetadata entity={entity} />
        <SynclinkItemMenu entity={entity} />
      </div>
    </>
  );
});
const VideoItem: FC = () => {
  const entity = useEntityConsumer();
  return (
    <>
      <video
        preload="metadata"
        controls
        className="synclink-item-preview h-[280px] object-cover rounded max-w-full"
        controlsList="nodownload"
      >
        <source
          src={`${__ENDPOINT__}/api/file/${entity.uid}`}
          type={entity.type}
        />
      </video>

      <div className="mt-4 flex justify-between items-center">
        <SynclinkItemMetadata entity={entity} />
        <SynclinkItemMenu entity={entity} />
      </div>
    </>
  );
};
const AudioItem: FC = () => {
  const entity = useEntityConsumer();
  return (
    <>
      <AudioPlayer
        className="synclink-item-preview pt-2"
        src={`${__ENDPOINT__}/api/file/${entity.uid}`}
        title={entity.name}
        type={entity.type}
      />
      <div className="mt-4 flex justify-between items-center">
        <SynclinkItemMetadata entity={entity} />
        <SynclinkItemMenu entity={entity} />
      </div>
    </>
  );
};
type RecordData = {
  name: string;
  size: string;
  type: string;
  __raw: InferResponse<typeof useGetDirectory>[number];
};
const DirectoryItem: FC = () => {
  const entity = useEntityConsumer();
  const { data: list, pending } = useGetDirectory({
    path: {
      id: entity.uid,
    },
  });
  const nodes = useMemo<TreeNode[]>(() => {
    if (!list) return [];
    const folderSizes = calculateFolderSizes(list);

    return toTreeByPath(list || [], (item, name) => ({
      id: item.path,
      key: item.hash || item.path,
      data: {
        name: name,
        size: item.is_file
          ? formatBytes(item.size)
          : formatBytes(folderSizes[item.path]) || '',
        type: item.mimetype || '-',
        __raw: item,
      } satisfies RecordData,
      expanded: !item.is_file,
      leaf: item.is_file,
    }));
  }, [list]);
  return (
    <>
      <div className="synclink-item-header">
        {/*<p className="synclink-item-title">{entity.uid}</p>*/}
        {/*<pre>{JSON.stringify(toTreeByPath(list || []), null, 2)}</pre>*/}
        <TreeTable
          id="path"
          value={nodes}
          tableStyle={{ minWidth: '50rem' }}
          loading={pending}
        >
          <Column
            field="name"
            header="Name"
            expander
            className="truncate"
            body={NameColumn}
          />
          <Column field="size" header="Size" />
          <Column field="type" header="Type" />
          <Column body={ActionColumn} align="right" />
        </TreeTable>
      </div>
      <div className="mt-4 flex justify-between">
        <SynclinkItemMetadata entity={entity} />
        <SynclinkItemMenu entity={entity} />
      </div>
    </>
  );
};
const NameColumn: FC<{ data: RecordData; options: unknown }> = ({ data }) => {
  return (
    <>
      {data.__raw.is_file ? (
        <FileIcon className="inline w-5 h-5 mr-1" />
      ) : (
        <FolderIcon className="inline w-5 h-5 mr-1" />
      )}
      <span className="align-middle">{data.name}</span>
    </>
  );
};
const ActionColumn: FC<{ data: RecordData; options: unknown }> = ({ data }) => {
  if (!data.__raw.is_file) return null;
  return (
    <>
      <button className="synclink-item-link">
        <DownloadCloudIcon className="w-4 h-4" />
        <span className="capitalize">{t`download`}</span>
      </button>
    </>
  );
};
const UnknownItem: FC = () => {
  const entity = useEntityConsumer();
  return (
    <>
      <div className="synclink-item-header">
        <p className="synclink-item-title">{entity.name}</p>
      </div>
      <div className="mt-4 flex justify-between">
        <SynclinkItemMetadata entity={entity} />
        <SynclinkItemMenu entity={entity} />
      </div>
    </>
  );
};

export const SynclinkItem: FC<{
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
  const render = useMemo(() => {
    switch (file.category) {
      case 'text':
        return <TextItem />;
      case 'image':
        return <FigureItem />;
      case 'video':
        return <VideoItem />;
      case 'audio':
        return <AudioItem />;
      case 'application':
        switch (file.format) {
          case 'x-tar':
            return <DirectoryItem />;
          default:
            return <UnknownItem />;
        }
      default:
        return <UnknownItem />;
    }
  }, [file.category, file.format]);
  const time = useMemo(() => {
    const created = dayjs(it.created);
    const diff = Math.abs(created.diff(dayjs(), 'days'));
    if (diff > 7) {
      return (
        <span>
          <span className="block text-xl text-gray-700 font-bold">
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
        className={clsx('synclink-item', className)}
        data-uid={it.uid}
        key={it.uid}
      >
        <div className="mb-2 text-sm flex items-end bg-[#f6f8fa] px-6 py-4">
          {time}
          {from}
        </div>
        <div className="flex-1 bg-white shadow-sm rounded p-5 px-3 pad:p-7 pb-4 outline-gray-400">
          {render}
        </div>
      </li>
    </EntityProvider>
  );
});

const calculateFolderSizes = (
  items: InferResponse<typeof useGetDirectory>,
): Record<string, number> => {
  const folderSizes: Record<string, number> = {};
  items.forEach((item) => {
    if (!item.is_file) {
      folderSizes[item.path] = 0;
    }
  });
  items.forEach((item) => {
    if (item.is_file) {
      let folderPath = item.path.substring(0, item.path.lastIndexOf('/'));
      while (folderPath) {
        const path = folderPath + '/';
        if (Reflect.has(folderSizes, path)) {
          folderSizes[path] += item.size;
        }
        folderPath = folderPath.substring(0, folderPath.lastIndexOf('/'));
      }
    }
  });
  return folderSizes;
};
