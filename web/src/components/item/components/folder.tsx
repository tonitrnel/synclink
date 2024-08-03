import { FC, useMemo, MouseEvent } from 'react';
import { useEntityConsumer } from '../entity-provider';
import { InferResponse, useGetDirectory } from '~/endpoints';
import { toTreeByPath } from '~/utils/to-tree-by-path';
import { formatBytes } from '~/utils/format-bytes';
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
import { useSnackbar } from '~/components/ui/snackbar';
import { openViewer, supportsFileViewer } from '~/components/viewer-dialog';
import { TreeNode } from '~/components/ui/tree';
import { TreeTable, TreeTableColumn } from '~/components/ui/tree-table';

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
  const { data: list } = useGetDirectory({
    path: {
      id: entity.uid,
    },
  });
  const nodes = useMemo<TreeNode<RecordData>[]>(() => {
    if (!list) return [];
    const folderSizes = calculateFolderSize(list);

    return toTreeByPath(list || [], (item, name) => ({
      id: item.hash || item.path,
      data: {
        name: name,
        size: item.is_file
          ? formatBytes(item.size)
          : formatBytes(folderSizes[item.path]) || '',
        type: item.mimetype || '-',
        lastModified: dayjs(item.mtime * 1e3).format('DD/MM/YYYY'),
        __raw: item,
      },
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
  const columns = useMemo<TreeTableColumn<RecordData>[]>(() => {
    const onlyFile = nodes.every(
      (it) => !it.children || it.children.length == 0,
    );
    return [
      {
        key: 'name',
        header: i18n._('Name'),
        expander: !onlyFile,
        className: 'truncate',
        render: (node) => <NameColumn data={node.data} />,
      },
      {
        key: 'size',
        header: i18n._('Size'),
        className: 'w-[96px]',
      },
      {
        key: 'type',
        header: i18n._('Type'),
        className: 'truncate',
      },
      {
        key: 'lastModified',
        header: i18n._('Last modified'),
        className: 'w-[128px]',
      },
      {
        key: 'action',
        render: (node) => (
          <ActionColumn
            id={entity.uid}
            data={node.data}
            onDownload={handler.download}
            onPreview={handler.preview}
          />
        ),
      },
    ];
  }, [entity.uid, handler.download, handler.preview, i18n, nodes]);
  return (
    <>
      <div className="cedasync-item-header">
        <TreeTable records={nodes} columns={columns} />
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

const NameColumn: FC<{ data: RecordData }> = ({ data }) => {
  return (
    <>
      {data.__raw.is_file ? (
        <FileIcon className="inline w-4 h-4 mr-1 text-gray-600" />
      ) : (
        <FolderIcon className="inline w-4 h-4 mr-1 text-gray-600" />
      )}
      <span className="align-middle">{data.name}</span>
    </>
  );
};
const ActionColumn: FC<{
  id: string;
  data: RecordData;
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
