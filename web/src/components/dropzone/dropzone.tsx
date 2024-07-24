import {
  DragEventHandler,
  FC,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ReactComponent as SendIcon } from '~/assets/send.svg';
import { IGNORE_FILE_TYPE } from '~/constants';
import type { DirEntry, FilesOrEntries } from '~/constants/types.ts';
import './dropzone.less';

type SettledDirEntry = Exclude<DirEntry, { type: 'file' }>;

const scanFiles = async (items: FileSystemEntry[]): Promise<DirEntry[]> => {
  const tree: DirEntry[] = [];
  const stack: Array<
    [
      list: DirEntry[],
      entries: FileSystemEntry[],
      parent: SettledDirEntry | null,
    ]
  > = [[tree, items, null]];
  const remove_prefix = (str: string, prefix: string) =>
    str.startsWith(prefix) ? str.slice(prefix.length) : str;
  const mtimeStack: Array<[entry: SettledDirEntry, mtime: number]> = [];
  while (stack.length > 0) {
    const [list, entries, parent] = stack.pop()!;
    let mtime = 0;
    for (const entry of entries) {
      if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const entries = await new Promise<FileSystemEntry[]>(
          (resolve, reject) =>
            reader.readEntries(
              (entries) => resolve(entries),
              (err) => reject(err),
            ),
        );
        const children: DirEntry[] = [];
        const index = list.length;
        list.push({
          name: entry.name,
          path: remove_prefix(entry.fullPath + '/', '/'),
          type: 'directory',
          mtime: 0,
          children,
        });
        stack.push([children, entries, list[index] as SettledDirEntry]);
      } else {
        const file = await new Promise<File>((resolve, reject) =>
          (entry as FileSystemFileEntry).file(
            (file) => resolve(file),
            (err) => reject(err),
          ),
        );
        if (file.lastModified > mtime) {
          mtime = file.lastModified;
        }
        list.push({
          name: entry.name,
          path: remove_prefix(entry.fullPath, '/'),
          type: 'file',
          mtime: file.lastModified,
          file,
        });
      }
    }
    if (parent) mtimeStack.push([parent, mtime]);
  }
  while (mtimeStack.length > 0) {
    const [entry, mtime] = mtimeStack.pop()!;
    if (mtime > entry.mtime) {
      Reflect.set(entry, 'mtime', mtime);
    }
    for (const child of entry.children.filter(
      (it): it is SettledDirEntry => it.mtime == 0,
    )) {
      Reflect.set(child, 'mtime', entry.mtime);
    }
  }
  return tree;
};

export const DropZone: FC<{
  onReceivedTransferData?(
    filesOrEntries: FilesOrEntries,
    rawTransferData?: DataTransfer,
  ): void;
}> = memo(({ onReceivedTransferData }) => {
  const [drop, setDrop] = useState(false);
  const triedRef = useRef(0);
  const handleDrop = useCallback<DragEventHandler>(
    async (evt) => {
      evt.preventDefault();
      triedRef.current = 0;
      setDrop(false);
      const items = Array.from(evt.dataTransfer.items);
      if (items.some((it) => it.webkitGetAsEntry()?.isDirectory)) {
        const entries = await scanFiles(
          items.map((it) => it.webkitGetAsEntry()!),
        );
        onReceivedTransferData?.(
          { type: 'dir-entries', entries },
          evt.dataTransfer,
        );
      } else {
        const files = await Promise.all(
          items
            .filter(
              (_, i) => !IGNORE_FILE_TYPE.includes(evt.dataTransfer.types[i]),
            )
            .reverse()
            .map((it, i) => {
              const file = it.getAsFile();
              if (file) return Promise.resolve(file);
              const type = evt.dataTransfer.types[i];
              return new Promise<File>((resolve) => {
                it.getAsString((it) => {
                  resolve(new File([it], '', { type }));
                });
              });
            }),
        );
        onReceivedTransferData?.(
          { type: 'multi-file', files },
          evt.dataTransfer,
        );
      }
    },
    [onReceivedTransferData],
  );
  useEffect(() => {
    let forbidden = false;
    const handleDragEnter = () => {
      // evt: DragEvent
      // Dragging inside the page
      if (forbidden) return void 0;
      const dialog = document.querySelector('*[role="dialog"]');
      if (dialog) return void 0;
      triedRef.current++;
      if (triedRef.current === 1) {
        setDrop(true);
      }
    };
    const handleDragLeave = () => {
      // evt: DragEvent
      // Dragging inside the page
      if (forbidden) return void 0;
      triedRef.current--;
      if (triedRef.current === 0) {
        setDrop(false);
      }
    };

    const handleDragStart = () => {
      forbidden = true;
    };
    const handleDragEnd = () => {
      forbidden = false;
    };
    const handleUnexpectedBlur = () => {
      setDrop(false);
      triedRef.current = 0;
    };
    document.body.addEventListener('dragenter', handleDragEnter);
    document.body.addEventListener('dragleave', handleDragLeave);
    document.body.addEventListener('dragstart', handleDragStart);
    document.body.addEventListener('dragend', handleDragEnd);
    window.addEventListener('blur', () => handleUnexpectedBlur);
    return () => {
      document.body.removeEventListener('dragenter', handleDragEnter);
      document.body.removeEventListener('dragleave', handleDragLeave);
      document.body.removeEventListener('dragstart', handleDragStart);
      document.body.removeEventListener('dragend', handleDragEnd);
      window.removeEventListener('blur', () => handleUnexpectedBlur);
    };
  }, []);
  useEffect(() => {
    if (drop) {
      document.body.style.setProperty('overflow', 'hidden');
    } else {
      document.body.style.removeProperty('overflow');
    }
    return () => {
      document.body.style.removeProperty('overflow');
    };
  }, [drop]);
  if (!drop) return null;
  return (
    <section
      className="dropzone"
      onDrop={handleDrop}
      onDragOver={(evt) => evt.preventDefault()}
    >
      <div className="dropzone-wrapper">
        <SendIcon />
        <span>Drag and Drop file here</span>
      </div>
    </section>
  );
});
