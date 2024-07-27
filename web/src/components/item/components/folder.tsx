import { FC, useMemo, MouseEvent } from 'react';
import { useEntityConsumer } from '../entity-provider';
import { InferResponse, useGetDirectory } from '~/endpoints';
import { TreeNode } from 'primereact/treenode';
import { toTreeByPath } from '~/utils/to-tree-by-path';
import { formatBytes } from '~/utils/format-bytes';
import { Column } from 'primereact/column';
import { TreeTable } from 'primereact/treetable';
import {
  DownloadCloudIcon,
  EyeIcon,
  FileIcon,
  FolderDownIcon,
  FolderIcon,
} from 'icons';
import { t } from '@lingui/macro';
import { Metadata } from './metadata';
import { CustomMenuSlot, Menu } from './menu';
import { downloadFromURL } from '~/utils/save-as';
import { saveDirectoryFromTarStream } from '~/utils/save-directory';
import dayjs from 'dayjs';
import { useLingui } from '@lingui/react';
import { useSnackbar } from '~/components/snackbar';
import { openViewer, supportsFileViewer } from '~/components/viewer-dialog';

type RecordData = {
  name: string;
  size: string;
  type: string;
  lastModified: string;
  __raw: InferResponse<typeof useGetDirectory>[number];
};

export const FolderItem: FC = () => {
  const entity = useEntityConsumer();
  const i18n = useLingui();
  const snackbar = useSnackbar();
  const { data: list, pending } = useGetDirectory({
    path: {
      id: entity.uid,
    },
  });
  const nodes = useMemo<TreeNode[]>(() => {
    if (!list) return [];
    const folderSizes = calculateFolderSize(list);

    return toTreeByPath(list || [], (item, name) => ({
      id: item.path,
      key: item.hash || item.path,
      data: {
        name: name,
        size: item.is_file
          ? formatBytes(item.size)
          : formatBytes(folderSizes[item.path]) || '',
        type: item.mimetype || '-',
        lastModified: dayjs(item.mtime * 1e3).format('DD/MM/YYYY'),
        __raw: item,
      } satisfies RecordData,
      expanded: !item.is_file,
      leaf: item.is_file,
    }));
  }, [list]);
  const downloadButton = useMemo<CustomMenuSlot>(
    () => ({
      key: 'download-as-directory',
      event: async () => {
        const res = await fetch(`${__ENDPOINT__}/api/file/${entity.uid}?raw`);
        if (!res.ok) {
          console.log(res);
          return void 0;
        }
        if (!res.body) {
          console.error('missing body');
          return void 0;
        }
        try {
          await saveDirectoryFromTarStream(res.body);
          snackbar.enqueueSnackbar({
            variant: 'success',
            message: i18n._('Download success'),
          });
        } catch (e) {
          console.error(e);
          if (e instanceof Error) {
            snackbar.enqueueSnackbar({
              variant: 'error',
              message: e.message,
            });
          }
        }
      },
      component: (
        <>
          <FolderDownIcon className="w-4 h-4" />
          <span className="capitalize">{t`Download folder`}</span>
        </>
      ),
    }),
    [entity.uid, i18n, snackbar],
  );
  const onlyFile = useMemo(
    () => nodes.every((it) => !it.children || it.children.length == 0),
    [nodes],
  );
  const handler = useMemo(
    () => ({
      download: (data: RecordData, evt: MouseEvent<HTMLAnchorElement>) => {
        evt.preventDefault();
        downloadFromURL(
          `${__ENDPOINT__}/api/directory/${entity.uid}/${data.__raw.hash}?raw`,
          data.name,
        );
      },
      preview: (data: RecordData) => {
        openViewer({
          resourceId: entity.uid,
          subResourceId: data.__raw.hash || data.__raw.path,
          filename: data.name,
          mimetype: data.type,
        });
      },
    }),
    [entity.uid],
  );
  return (
    <>
      <div className="cedasync-item-header">
        {/*<p className="cedasync-item-title">{entity.uid}</p>*/}
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
            expander={!onlyFile}
            className="truncate"
            body={NameColumn}
          />
          <Column field="size" header={i18n._('Size')} className="w-[96px]" />
          <Column field="type" header={i18n._('Type')} />
          <Column
            field="lastModified"
            header={i18n._('Last modified')}
            className="w-[128px]"
          />
          <Column
            body={({ data, options }) => (
              <ActionColumn
                id={entity.uid}
                data={data}
                options={options}
                onDownload={handler.download}
                onPreview={handler.preview}
              />
            )}
          />
        </TreeTable>
      </div>
      <div className="mt-4 flex justify-between">
        <Metadata entity={entity} />
        <Menu
          entity={entity}
          slots={[saveDirectoryFromTarStream.SUPPORTED && downloadButton]}
        />
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
const ActionColumn: FC<{
  id: string;
  data: RecordData;
  options: unknown;
  onDownload(data: RecordData, evt: MouseEvent<HTMLAnchorElement>): void;
  onPreview(data: RecordData, evt: MouseEvent<HTMLButtonElement>): void;
}> = ({ id, data, onPreview, onDownload }) => {
  const i18n = useLingui();
  if (!data.__raw.is_file) return null;
  return (
    <div className="flex gap-2 justify-end">
      {supportsFileViewer(data.name, data.type) && (
        <button
          className="cedasync-item-link"
          onClick={(evt) => onPreview(data, evt)}
        >
          <EyeIcon className="w-4 h-4" />
          <span>{i18n._('Preview')}</span>
        </button>
      )}
      <a
        className="cedasync-item-link"
        onClick={(evt) => onDownload(data, evt)}
        href={`${__ENDPOINT__}/api/directory/${id}/${data.__raw.hash}?raw`}
      >
        <DownloadCloudIcon className="w-4 h-4" />
        <span>{i18n._('Download')}</span>
      </a>
    </div>
  );
};

const calculateFolderSize = (
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
