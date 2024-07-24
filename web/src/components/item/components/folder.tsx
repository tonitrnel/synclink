import { FC, useMemo } from 'react';
import { useEntityConsumer } from '../entity-provider';
import { InferResponse, useGetDirectory } from '~/endpoints';
import { TreeNode } from 'primereact/treenode';
import { toTreeByPath } from '~/utils/to-tree-by-path';
import { formatBytes } from '~/utils/format-bytes';
import { Column } from 'primereact/column';
import { TreeTable } from 'primereact/treetable';
import { DownloadCloudIcon, FileIcon, FolderDownIcon, FolderIcon } from 'icons';
import { t } from '@lingui/macro';
import { Metadata } from './metadata';
import { CustomMenuSlot, Menu } from './menu';
import { downloadFromURL } from '~/utils/save-as';
import { saveDirectoryFromTarStream } from '~/utils/save-directory';
import dayjs from 'dayjs';
import { useLingui } from '@lingui/react';

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
        } catch (e) {
          console.error(e);
        }
      },
      component: (
        <>
          <FolderDownIcon className="w-4 h-4" />
          <span className="capitalize">{t`Download folder`}</span>
        </>
      ),
    }),
    [],
  );
  const onlyFile = useMemo(() => nodes.every(it => !it.children || it.children.length == 0), [nodes])
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
              <ActionColumn id={entity.uid} data={data} options={options} />
            )}
            align="right"
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
const ActionColumn: FC<{ id: string; data: RecordData; options: unknown }> = ({
  id,
  data,
}) => {
  const href = `${__ENDPOINT__}/api/directory/${id}/${data.__raw.hash}?raw`;
  const handler = useMemo(
    () => ({
      download: (evt: MouseEvent) => {
        evt.preventDefault();
        downloadFromURL(href, data.name);
      },
    }),
    [data.name, href],
  );
  if (!data.__raw.is_file) return null;
  return (
    <>
      <a className="synclink-item-link" onClick={handler.download} href={href}>
        <DownloadCloudIcon className="w-4 h-4" />
        <span className="capitalize">{t`download`}</span>
      </a>
    </>
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
