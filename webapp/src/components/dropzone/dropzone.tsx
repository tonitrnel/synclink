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
import './dropzone.css';

export const DropZone: FC<{
  onReceivedTransferData?(files: File[], rawTransferData: DataTransfer): void;
}> = memo(({ onReceivedTransferData }) => {
  const [drop, setDrop] = useState(false);
  const triedRef = useRef(0);
  const handleDrop = useCallback<DragEventHandler>(
    async (evt) => {
      evt.preventDefault();
      triedRef.current = 0;
      setDrop(false);
      const files = await Promise.all(
        Array.from(evt.dataTransfer.items)
          .filter(
            (_, i) => !IGNORE_FILE_TYPE.includes(evt.dataTransfer.types[i])
          )
          // ignore directory
          .filter((it) => it.webkitGetAsEntry()?.isFile ?? true)
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
          })
      );
      onReceivedTransferData?.(files, evt.dataTransfer);
    },
    [onReceivedTransferData]
  );
  useEffect(() => {
    let forbidden = false;
    const handleDragEnter = () => {
      // evt: DragEvent
      // Dragging inside the page
      if (forbidden) return void 0;
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
  if (!drop) return null;
  return (
    <div
      className="dropzone"
      onDrop={handleDrop}
      onDragOver={(evt) => evt.preventDefault()}
    >
      <SendIcon />
      <span>Drop Zone</span>
    </div>
  );
});
