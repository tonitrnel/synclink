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
import type { DirEntry, FilesOrEntries } from '~/constants/types.ts';
import { useLingui } from '@lingui/react';
import { AnimatePresence, motion, Variant } from 'framer-motion';
import dayjs from 'dayjs';
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
  onReceivedTransferData?(filesOrEntries: FilesOrEntries, source: 'drop'): void;
}> = memo(({ onReceivedTransferData }) => {
  const [dropped, setDropped] = useState(false);
  const i18n = useLingui();
  const triedRef = useRef(0);
  const handleDrop = useCallback<DragEventHandler>(
    async (evt) => {
      evt.preventDefault();
      triedRef.current = 0;
      setDropped(false);
      const items = Array.from(evt.dataTransfer.items);
      if (items.some((it) => it.webkitGetAsEntry()?.isDirectory)) {
        const entries = await scanFiles(
          items.map((it) => it.webkitGetAsEntry()!),
        );
        onReceivedTransferData?.({ type: 'dir-entries', entries }, 'drop');
      } else {
        const types = evt.dataTransfer.types;
        console.log(`start handle drop event, types: ${types}`);
        // types 只有 Files 表示拖拽文件文件
        if (types.length == 1 && types[0] == 'Files') {
          const files = await Promise.all(items.map((it) => it.getAsFile()!));
          onReceivedTransferData?.({ type: 'multi-file', files }, 'drop');
          return void 0;
        }
        // types 只有 text/plain 表示纯文本
        if (types.length == 1 && types[0] == 'text/plain') {
          const files = await Promise.all(
            items.map((it) =>
              new Promise<string>((resolve) => it.getAsString(resolve)).then(
                (str) =>
                  new File(
                    [str],
                    `pasted_${dayjs().format('YYYYMMDD_HHmm')}.txt`,
                    { type: 'text/plain', lastModified: Date.now() },
                  ),
              ),
            ),
          );
          onReceivedTransferData?.({ type: 'multi-file', files }, 'drop');
          return void 0;
        }
        // types 有多个类型并且存在 Files 常见于拖拽其他页面的图片
        if (types.length > 1 && types.includes('Files')) {
          const index = types.indexOf('Files');
          const files = await Promise.all([items[index].getAsFile()!]);
          onReceivedTransferData?.({ type: 'multi-file', files }, 'drop');
          return void 0;
        }
        // types 有多个类型并且存在 text/plain 表示存在富文本或者其他类型的文本，但都不支持，因此忽略
        if (types.length > 1 && types.includes('text/plain')) {
          const index = types.indexOf('text/plain');
          const files = await Promise.all([
            new Promise<string>((resolve) =>
              items[index].getAsString(resolve),
            ).then(
              (str) =>
                new File(
                  [str],
                  `pasted_${dayjs().format('YYYYMMDD_HHmm')}.txt`,
                  { type: 'text/plain', lastModified: Date.now() },
                ),
            ),
          ]);
          onReceivedTransferData?.({ type: 'multi-file', files }, 'drop');
          return void 0;
        }
        console.warn(`Unable handle drop event, types: ${types}`);
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
        setDropped(true);
      }
    };
    const handleDragLeave = () => {
      // evt: DragEvent
      // Dragging inside the page
      if (forbidden) return void 0;
      triedRef.current--;
      if (triedRef.current === 0) {
        setDropped(false);
      }
    };

    const handleDragStart = () => {
      forbidden = true;
    };
    const handleDragEnd = () => {
      forbidden = false;
    };
    const handleUnexpectedBlur = () => {
      setDropped(false);
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
    if (dropped) {
      document.body.style.setProperty('overflow', 'hidden');
    } else {
      document.body.style.removeProperty('overflow');
    }
    return () => {
      document.body.style.removeProperty('overflow');
    };
  }, [dropped]);
  return (
    <AnimatePresence>
      {dropped && (
        <motion.section
          className="dropzone"
          onDrop={handleDrop}
          onDragOver={(evt) => evt.preventDefault()}
          variants={variants}
          initial="hidden"
          animate="show"
        >
          <motion.div
            className="dropzone-wrapper"
            variants={wrapperVariants}
            initial="hidden"
            animate="show"
          >
            <SendIcon />
            <span>{i18n._('Drag and Drop file here')}</span>
          </motion.div>
        </motion.section>
      )}
    </AnimatePresence>
  );
});

const variants: Record<string, Variant> = {
  hidden: {
    opacity: 0,
  },
  show: {
    opacity: 1,
  },
};

const wrapperVariants: Record<string, Variant> = {
  hidden: {
    scale: 0.9,
  },
  show: {
    scale: 1,
  },
};
