import { ChangeEvent, FC, memo, useCallback, useMemo, useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { FileIcon, FolderIcon, Trash2Icon, UploadIcon } from 'icons';
import { Chips, type ChipsChangeEvent } from 'primereact/chips';
import { withProduce } from '~/utils/with-produce.ts';
import { InputText } from 'primereact/inputtext';
import { Column } from 'primereact/column';
import { formatBytes } from '~/utils/format-bytes';
import dayjs from 'dayjs';
import { TreeTable } from 'primereact/treetable';
import { useGetStats } from '~/endpoints';
import { DirEntry, FilesOrEntries } from '~/constants/types';
import { TreeNode } from 'primereact/treenode';
import { useLingui } from '@lingui/react';
import { useLatestRef } from '@painted/shared';
import './file-upload-dialog.css';

interface RecordData {
  name: string;
  size: string;
  lastModified: string;
  __raw: DirEntry;
}

interface State {
  entries: DirEntry[];
  tags: string[];
  caption: string;
}

export const FileUploadDialog: FC<{
  mode: 'file' | 'directory';
  filesOrEntries: FilesOrEntries;
  visible: boolean;
  onClose(value?: {
    entries: FilesOrEntries;
    tags: string[];
    caption: string;
  }): void;
}> = memo(({ mode, filesOrEntries, visible, onClose }) => {
  const [state, setState] = useState<State>(() => {
    const entries =
      filesOrEntries.type === 'multi-file'
        ? mode === 'directory'
          ? scanFiles(filesOrEntries.files)
          : filesOrEntries.files.map<DirEntry>((it) => ({
              name: it.name,
              path: '',
              type: 'file',
              file: it,
              mtime: it.lastModified,
            }))
        : filesOrEntries.entries;
    return {
      entries: entries as DirEntry[],
      tags: [],
      caption: '',
    };
  });
  const stateRef = useLatestRef(state);
  const { data } = useGetStats({
    keepDirtyOnPending: true,
    cache: {
      key: 'stats',
    },
  });
  const i18n = useLingui();
  const onCancel = useCallback(() => {
    onClose();
  }, [onClose]);
  const onConfirm = useCallback(() => {
    const state = stateRef.current;
    onClose({
      tags: [
        ...new Set(
          state.tags.map((it) => it.trim()).filter((it) => it.length > 0),
        ),
      ],
      caption: state.caption.trim(),
      entries:
        mode == 'directory'
          ? {
              type: 'dir-entries',
              entries: state.entries,
            }
          : {
              type: 'multi-file',
              files: (
                state.entries as Exclude<DirEntry, { type: 'directory' }>[]
              ).map((it) => it.file),
            },
    });
  }, [mode, onClose, stateRef]);
  const onChipsChange = useCallback((evt: ChipsChangeEvent) => {
    const value = !evt.value ? [] : evt.value;
    withProduce(setState, (draft) => {
      draft.tags = [...value];
    });
  }, []);
  const onCaptionChange = useCallback((evt: ChangeEvent<HTMLInputElement>) => {
    withProduce(setState, (draft) => {
      draft.caption = evt.target.value;
    });
  }, []);
  const { nodes, fileCount, dirCount, total } = useMemo(() => {
    let fileCount = 0;
    let dirCount = 0;
    let total = 0;
    const nodes = dirEntryToTree(state.entries, (it) => {
      if (it.type == 'directory') dirCount += 1;
      else {
        fileCount += 1;
        total += it.file.size;
      }
      return {
        id: it.path,
        key: it.path,
        data: {
          name: it.name,
          size: it.type == 'file' ? formatBytes(it.file.size) : '-',
          lastModified: dayjs(it.mtime).format('DD/MM/YYYY'),
          __raw: it,
        } satisfies RecordData,

        expanded: it.type == 'directory',
        leaf: it.type == 'file',
      };
    });
    return {
      nodes,
      fileCount,
      dirCount,
      total,
    };
  }, [state.entries]);
  const stats = useMemo(() => {
    if (!data) return void 0;
    return [
      {
        key: 'reservedSpace',
        color: '#68686b',
        value:
          Math.floor((data.default_reserved / data.storage_quota) * 10000) /
          100,
        size: formatBytes(data.default_reserved),
      },
      {
        key: 'usedSpace',
        color: '#2a94eb',
        value: Math.floor((data.disk_usage / data.storage_quota) * 10000) / 100,
        size: formatBytes(data.disk_usage),
      },
      {
        key: 'plannedSpace',
        color: '#2a94eb',
        value: Math.floor((total / data.storage_quota) * 10000) / 100,
        size: formatBytes(total),
      },
    ];
  }, [data, total]);
  const isLack = useMemo(() => {
    if (!data) return true;
    return (
      total > data.storage_quota - data.default_reserved ||
      state.entries.length == 0
    );
  }, [data, state.entries.length, total]);
  return (
    <Dialog
      visible={visible}
      closable={false}
      onHide={onCancel}
      modal
      className="w-[580px] bg-white p-8"
      content={() => (
        <>
          <header className="flex justify-between items-center">
            <h3 className="font-bold text-lg">
              {mode == 'directory'
                ? i18n._('Upload folder')
                : i18n._('Upload files')}
            </h3>
            {stats && (
              <div
                className="p-metergroup-meter-container w-[64px] h-[4px] flex rounded-xl bg-gray-200"
                title={`${i18n._('Application reserved:')} ${stats[0].size}(${stats[0].value}%) \n${i18n._('Used:')} ${stats[1].size}(${stats[1].value}%) \n${i18n._('Planned use:')} ${stats[2].size}(${stats[2].value}%)`}
              >
                {stats.map((it) => (
                  <span
                    key={it.key}
                    className="p-metergroup-meter bg-currentColor"
                    style={{ width: `${it.value}%`, color: it.color }}
                  />
                ))}
              </div>
            )}
          </header>
          <main className="py-4 max-h-[60vh] overflow-auto">
            <p className="flex gap-1 mb-2">
              {mode == 'directory' && (
                <span className="text-palette-ocean-blue">
                  {i18n._('Folders:')} {dirCount} items
                </span>
              )}
              <span className="text-palette-deep-green">
                {i18n._('File:')} {fileCount} items
              </span>
              <span className="text-palette-bright-orange">
                {i18n._('Total Size:')} {stats?.[2].size || '-'}
              </span>
            </p>
            <TreeTable
              id="path"
              value={nodes}
              scrollable
              scrollHeight="240px"
              className="border border-gray-200 rounded-lg overflow-hidden scroll-default"
            >
              <Column
                field="name"
                header={i18n._('Name')}
                expander
                className="truncate max-w-[120px]"
                body={NameColumn}
              />
              <Column
                field="size"
                header={i18n._('Size')}
                className="w-[96px]"
              />
              <Column
                field="lastModified"
                header={i18n._('Last modified')}
                className="w-[128px]"
              />
            </TreeTable>
            <div className="mt-8">
              <div className="mt-2">
                <label htmlFor="file-caption">
                  <span className="font-bold">{i18n._('Caption')}</span>
                  {i18n._('(Optional)')}
                </label>
                <div className="py-2">
                  <InputText
                    id="file-caption"
                    className="w-full rounded-lg"
                    onChange={onCaptionChange}
                  />
                </div>
              </div>
              <div className="mt-2">
                <label htmlFor="file-tags">
                  <span className="font-bold">{i18n._('Add tags')}</span>
                  {i18n._('(Optional)')}
                </label>
                <div className="py-2 w-full upload-dialog__file-tags">
                  <Chips
                    inputId="file-tags"
                    value={state.tags}
                    onChange={onChipsChange}
                    separator=","
                    max={10}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </main>
          <footer className="flex justify-end px-2 gap-2">
            <Button
              severity="danger"
              text
              className="px-3 py-2 rounded-lg"
              onClick={onCancel}
            >
              <Trash2Icon className="w-4 h-4 mr-1" />
              <span>{i18n._('Discard')}</span>
            </Button>
            <Button
              severity="secondary"
              className="px-3 py-2 rounded-lg"
              disabled={isLack}
              onClick={onConfirm}
            >
              <UploadIcon className="w-4 h-4 mr-1" />
              <span>{i18n._('Upload')}</span>
            </Button>
          </footer>
        </>
      )}
    />
  );
});

type SettledDirEntry = Exclude<DirEntry, { type: 'file' }>;

const scanFiles = (items: readonly File[]): DirEntry[] => {
  const dirMap = new Map<string, SettledDirEntry>([
    [
      '/',
      {
        name: '/',
        path: '/',
        type: 'directory',
        mtime: 0,
        children: [],
      },
    ],
  ]);
  const mtimeStack: Array<[entry: SettledDirEntry, mtime: number]> = [];
  const ensureDir = (parentDir: string): SettledDirEntry => {
    if (!dirMap.has(parentDir)) {
      const parts = parentDir.split('/');
      const name = parts.pop()!;
      const parent = parts.join('/') || '/';
      ensureDir(parent);
      const entry: DirEntry = {
        name,
        path: parentDir,
        type: 'directory',
        mtime: 0,
        children: [],
      };
      dirMap.set(parentDir, entry);
      (dirMap.get(parent)!.children as DirEntry[]).push(entry);
    }
    return dirMap.get(parentDir)!;
  };
  for (const item of items) {
    const dirPath =
      item.webkitRelativePath.split('/').slice(0, -1).join('/') || '/';
    if (!dirMap.has(dirPath)) {
      const parts = dirPath.split('/');
      const name = parts.pop()!;
      const parentDir = parts.join('/') || '/';
      const entry: DirEntry = {
        name,
        path: dirPath,
        type: 'directory',
        mtime: 0,
        children: [],
      };
      dirMap.set(dirPath, entry);
      const children = ensureDir(parentDir).children as DirEntry[];
      children.push(entry);
    }
    const parent = dirMap.get(dirPath)!;
    const children = parent.children as DirEntry[];
    children.push({
      name: item.name,
      path: item.webkitRelativePath,
      type: 'file',
      file: item,
      mtime: item.lastModified,
    });
    mtimeStack.push([parent, item.lastModified]);
  }
  const entries = dirMap.get('/')!.children as DirEntry[];
  while (mtimeStack.length > 0) {
    const [entry, mtime] = mtimeStack.pop()!;
    if (mtime <= entry.mtime) {
      continue;
    }
    Reflect.set(entry, 'mtime', mtime);
    const parentPath = entry.path.split('/').slice(0, -1).join('/');
    const parent = parentPath ? dirMap.get(parentPath) : undefined;
    if (parent) {
      mtimeStack.unshift([parent, mtime]);
    }
  }
  return entries;
};

const dirEntryToTree = (
  entries: readonly DirEntry[],
  mapper: (item: DirEntry) => TreeNode,
): TreeNode[] => {
  const stack: DirEntry[] = [...entries];
  const map = new Map<string, TreeNode>([['/', { id: 'root', children: [] }]]);
  while (stack.length > 0) {
    const entry = stack.shift()!;
    const path = entry.path.split('/').slice(0, -1).join('/') || '/';
    const parent = map.get(path)!;
    if (!parent.children) {
      parent.children = [];
    }
    if (entry.type == 'file') {
      parent.children.push(mapper(entry));
    } else {
      const obj = mapper(entry);
      map.set(entry.path, obj);
      parent.children.push(obj);
      stack.push(...entry.children);
    }
  }
  return map.get('/')?.children ?? [];
};

const NameColumn: FC<{ data: RecordData; options: unknown }> = ({ data }) => {
  return (
    <>
      {data.__raw.type == 'file' ? (
        <FileIcon className="inline w-5 h-5 mr-1" />
      ) : (
        <FolderIcon className="inline w-5 h-5 mr-1" />
      )}
      <span className="align-middle">{data.name}</span>
    </>
  );
};
