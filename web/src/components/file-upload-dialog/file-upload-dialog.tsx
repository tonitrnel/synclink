import { ChangeEvent, FC, memo, useCallback, useMemo } from 'react';
import { FileIcon, FolderIcon, Trash2Icon, UploadIcon } from 'icons';
import { FilesOrEntries } from '~/constants/types';
import { useLingui } from '@lingui/react';
import { Input } from '~/components/ui/input';
import { Alert } from '~/components/ui/alert';
import { Dialog } from '../ui/dialog';
import { Button } from '../ui/button';
import { TreeNode } from '../ui/tree';
import { TreeTable, TreeTableColumn } from '../ui/tree-table';
import { TagInput } from '../ui/tag-input';
import { FormValue, RecordData, Stat, useFileUploadLogic } from './logic.ts';
import './file-upload-dialog.css';

export const FileUploadImpl: FC<{
  mode: 'file' | 'directory';
  isLack: boolean;
  dirCount: number;
  fileCount: number;
  nodes: TreeNode<RecordData>[];
  tags: string[];
  caption: string;
  onTagsChange(tags: string[]): void;
  onCaptionChange(caption: string): void;
  stats: Stat[] | undefined;
}> = ({
  mode,
  isLack,
  dirCount,
  fileCount,
  nodes,
  onTagsChange: onTagsChangeProp,
  onCaptionChange: onCaptionChangeProps,
  tags,
  caption,
  stats,
}) => {
  const i18n = useLingui();
  const onTagsChange = useCallback(
    (value: string[]) => {
      onTagsChangeProp(value);
    },
    [onTagsChangeProp],
  );
  const onCaptionChange = useCallback(
    (evt: ChangeEvent<HTMLInputElement>) => {
      onCaptionChangeProps(evt.target.value);
    },
    [onCaptionChangeProps],
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
    <>
      {isLack && (
        <Alert variant="destructive" className="my-4 w-full py-4">
          {i18n._(
            "You can't upload the file because the disk has exceeded its quota",
          )}
        </Alert>
      )}
      {stats && (
        <div className="my-4 overflow-hidden py-2">
          <div className="flex h-1 w-full overflow-hidden bg-gray-200">
            {stats.map((it) => (
              <span
                key={it.key}
                className="inline-block h-full bg-current"
                style={{ width: `${it.value}%`, color: it.color }}
              />
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-sm">
            <div className="flex items-center gap-1">
              <span
                className="inline-block h-1 w-2 bg-current"
                style={{ color: stats[0].color }}
              />
              <span>{`${i18n._('Reserved:')} ${stats[0].size}(${stats[0].value}%)`}</span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className="inline-block h-1 w-2 bg-current"
                style={{ color: stats[1].color }}
              />
              <span>{`${i18n._('Used:')} ${stats[1].size}(${stats[1].value}%)`}</span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className="inline-block h-1 w-2 bg-current"
                style={{ color: stats[2].color }}
              />
              <span>{`${i18n._('Planned use:')} ${stats[2].size}(^${stats[2].value}%)`}</span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className="inline-block h-1 w-2 bg-current"
                style={{ color: stats[3].color }}
              />
              <span>{`${i18n._('Free:')} ${stats[3].size}(${stats[3].value}%)`}</span>
            </div>
          </div>
        </div>
      )}
      <div className="my-4 py-2">
        <p className="mb-4 flex gap-1 font-bold">
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
        <TreeTable records={nodes} columns={columns} scrollHeight="12rem" />
      </div>
      <div className="my-4 py-2">
        <div className="mt-2">
          <label htmlFor="file-caption">
            <span className="font-bold">{i18n._('Caption')}</span>
          </label>
          <div className="py-2">
            <Input
              id="file-caption"
              value={caption}
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
          <div className="w-full py-2">
            <TagInput
              id="file-tags"
              value={tags}
              onChange={onTagsChange}
              separator=","
              max={10}
              className="w-full rounded-lg"
              placeholder={i18n._('Optional')}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export const FileUploadDialog: FC<{
  mode: 'file' | 'directory';
  filesOrEntries: FilesOrEntries;
  visible: boolean;
  onClose(value?: FormValue): void;
}> = memo(({ mode, filesOrEntries, visible, onClose }) => {
  const {
    state,
    nodes,
    isLack,
    dirCount,
    fileCount,
    stats,
    buildFormValue,
    handlers,
  } = useFileUploadLogic({ mode, filesOrEntries });
  const i18n = useLingui();
  const onCancel = useCallback(() => {
    onClose();
  }, [onClose]);
  const onConfirm = useCallback(() => {
    onClose(buildFormValue());
  }, [buildFormValue, onClose]);
  return (
    <Dialog
      visible={visible}
      onClose={onCancel}
      className="w-[48rem] bg-white p-8"
    >
      <div className="flex items-center justify-between">
        <Dialog.Title>
          {mode == 'directory'
            ? i18n._('Upload folder')
            : i18n._('Upload files')}
        </Dialog.Title>
        <Dialog.Description className="sr-only">
          {i18n._('Check the files or folders to be upload')}
        </Dialog.Description>
      </div>
      <Dialog.Content>
        <main className="overflow-auto px-1">
          <FileUploadImpl
            mode={mode}
            isLack={isLack}
            dirCount={dirCount}
            fileCount={fileCount}
            nodes={nodes}
            stats={stats}
            onCaptionChange={handlers.changeCaption}
            onTagsChange={handlers.changeTags}
            caption={state.caption}
            tags={state.tags}
          />
        </main>
      </Dialog.Content>
      <Dialog.Footer className="flex justify-end gap-2 px-2">
        <Button
          variant="destructive"
          className="rounded-lg px-3 py-2"
          onClick={onCancel}
        >
          <Trash2Icon className="mr-1 h-4 w-4" />
          <span>{i18n._('Discard')}</span>
        </Button>
        <Button
          className="rounded-lg px-3 py-2"
          disabled={isLack}
          onClick={onConfirm}
        >
          <UploadIcon className="mr-1 h-4 w-4" />
          <span>{i18n._('Upload')}</span>
        </Button>
      </Dialog.Footer>
    </Dialog>
  );
});

const NameColumn: FC<{ data: RecordData }> = ({ data }) => {
  return (
    <>
      {data.__raw.type == 'file' ? (
        <FileIcon className="mr-1 inline h-5 w-5" />
      ) : (
        <FolderIcon className="mr-1 inline h-5 w-5" />
      )}
      <span className="align-middle" title={data.name}>
        {data.name}
      </span>
    </>
  );
};
