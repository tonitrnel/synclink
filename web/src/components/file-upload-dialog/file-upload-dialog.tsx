import { ChangeEvent, FC, memo, useCallback, useMemo, useState } from 'react';
import { FileIcon, FolderIcon, Trash2Icon, UploadIcon } from 'icons';
import { withProduce } from '~/utils/with-produce.ts';
import { formatBytes } from '~/utils/format-bytes';
import dayjs from 'dayjs';
import { useGetStats } from '~/endpoints';
import { DirEntry, FilesOrEntries } from '~/constants/types';
import { useLingui } from '@lingui/react';
import { useLatestRef } from '@painted/shared';
import { Input } from '~/components/ui/input';
import { Alert } from '~/components/ui/alert';
// import { Tag, TagInput } from '../ui/tag';
import './file-upload-dialog.css';
import { Dialog } from '../ui/dialog';
import { Button } from '../ui/button';
import { TreeNode } from '../ui/tree';
import { TreeTable, TreeTableColumn } from '../ui/tree-table';
import { TagInput } from '../ui/tag-input';

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
  const onTagsChange = useCallback((value: string[]) => {
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
    const nodes = dirEntryToTree(state.entries, (it): TreeNode<RecordData> => {
      if (it.type == 'directory') dirCount += 1;
      else {
        fileCount += 1;
        total += it.file.size;
      }
      return {
        id: it.path + it.name,
        data: {
          name: it.name,
          size: it.type == 'file' ? formatBytes(it.file.size) : '-',
          lastModified: dayjs(it.mtime).format('DD/MM/YYYY'),
          __raw: it,
        } satisfies RecordData,
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
    const plannedSpace = Math.floor((total / data.storage_quota) * 10000) / 100;
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
        color:
          plannedSpace >= 100
            ? '#ec706e'
            : plannedSpace >= 75
              ? '#f7921a'
              : '#2a94eb',
        value: plannedSpace,
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
  const columns = useMemo<TreeTableColumn<RecordData>[]>(() => {
    const onlyFile = nodes.every(
      (it) => !it.children || it.children.length == 0,
    );
    return [
      {
        key: 'name',
        header: i18n._('Name'),
        expander: !onlyFile,
        className: 'truncate max-w-[120px]',
        render: (node) => <NameColumn data={node.data} />,
      },
      {
        key: 'size',
        header: i18n._('Size'),
        className: 'w-[96px]',
      },
      {
        key: 'lastModified',
        header: i18n._('Last modified'),
        className: 'w-[128px]',
      },
    ];
  }, [i18n, nodes]);
  return (
    <Dialog
      visible={visible}
      onClose={onCancel}
      className="w-[48rem] bg-white p-8"
    >
      <div className="flex justify-between items-center">
        <Dialog.Title>
          {mode == 'directory'
            ? i18n._('Upload folder')
            : i18n._('Upload files')}
        </Dialog.Title>
        <Dialog.Description className="sr-only">
          {i18n._('Check the files or folders to be upload')}
        </Dialog.Description>
        {stats && (
          <div
            className="p-metergroup-meter-container w-[64px] h-[4px] flex rounded-xl bg-gray-200"
            title={`${i18n._('Application reserved:')} ${stats[0].size}(${stats[0].value}%) \n${i18n._('Used:')} ${stats[1].size}(${stats[1].value}%) \n${i18n._('Planned use:')} ${stats[2].size}(${stats[2].value}%)`}
          >
            {stats.map((it) => (
              <span
                key={it.key}
                className="p-metergroup-meter bg-current"
                style={{ width: `${it.value}%`, color: it.color }}
              />
            ))}
          </div>
        )}
      </div>
      <Dialog.Content>
        <main className="py-4 max-h-[60vh] overflow-auto">
          {isLack && (
            <Alert variant="destructive" className="w-full mb-6 py-4">
              {i18n._(
                "You can't upload the file because the disk has exceeded its quota",
              )}
            </Alert>
          )}
          <p className="flex gap-1 mb-4">
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
            records={nodes}
            columns={columns}
            scrollHeight="12rem"
          />
          <div className="mt-8 px-2">
            <div className="mt-2">
              <label htmlFor="file-caption">
                <span className="font-bold">{i18n._('Caption')}</span>
              </label>
              <div className="py-2">
                <Input
                  id="file-caption"
                  className="w-full rounded-lg"
                  onChange={onCaptionChange}
                  placeholder={i18n._('Optional')}
                />
              </div>
            </div>
            <div className="mt-2">
              <label htmlFor="file-tags">
                <span className="font-bold">{i18n._('Add tags')}</span>
              </label>
              <div className="py-2 w-full">
                <TagInput
                  id="file-tags"
                  value={state.tags}
                  onChange={onTagsChange}
                  separator=","
                  max={10}
                  className="w-full rounded-lg"
                  placeholder={i18n._('Optional')}
                />
              </div>
            </div>
          </div>
        </main>
      </Dialog.Content>
      <Dialog.Footer className="flex justify-end px-2 gap-2">
        <Button
          variant="destructive"
          className="px-3 py-2 rounded-lg"
          onClick={onCancel}
        >
          <Trash2Icon className="w-4 h-4 mr-1" />
          <span>{i18n._('Discard')}</span>
        </Button>
        <Button
          className="px-3 py-2 rounded-lg"
          disabled={isLack}
          onClick={onConfirm}
        >
          <UploadIcon className="w-4 h-4 mr-1" />
          <span>{i18n._('Upload')}</span>
        </Button>
      </Dialog.Footer>
    </Dialog>
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

const dirEntryToTree = <T,>(
  entries: readonly DirEntry[],
  mapper: (item: DirEntry) => TreeNode<T>,
): TreeNode<T>[] => {
  const stack: DirEntry[] = [...entries];
  const map = new Map<string, TreeNode<T>>([
    ['/', { id: 'root', children: [], data: undefined as T } as TreeNode<T>],
  ]);
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

const NameColumn: FC<{ data: RecordData }> = ({ data }) => {
  return (
    <>
      {data.__raw.type == 'file' ? (
        <FileIcon className="inline w-5 h-5 mr-1" />
      ) : (
        <FolderIcon className="inline w-5 h-5 mr-1" />
      )}
      <span className="align-middle" title={data.name}>
        {data.name}
      </span>
    </>
  );
};
