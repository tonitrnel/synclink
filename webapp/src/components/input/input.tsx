import { FC, memo, useCallback, useMemo, useRef } from 'react';
import { ReactComponent as UploadCloudIcon } from '~/assets/upload-cloud.svg';
import { ReactComponent as SendIcon } from '~/assets/send.svg';
import { ReactComponent as ClipboardPasteIcon } from '~/assets/clipboard-paste.svg';
import { DropZone } from '../dropzone';
import { executeAsyncTask } from '~/utils/execute-async-task.ts';
import { openFilePicker } from '~/utils/open-file-picker.ts';
import { IGNORE_FILE_TYPE } from '~/constants';
import { upload } from '~/utils/upload.ts';
import './input.css';

export const Input: FC = memo(() => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const handleSend = useMemo(
    () =>
      executeAsyncTask(async () => {
        const textarea = textareaRef.current;
        if (!textarea || textarea.value.trim().length === 0) {
          return void 0;
        }
        try {
          await upload(new File([textarea.value], '', { type: 'text/plain' }));
          textarea.value = '';
        } catch (e) {
          console.error('Seed failed', e);
        }
      }),
    []
  );
  const handleUpload = useMemo(
    () =>
      executeAsyncTask(async () => {
        const files = await openFilePicker(['*']);
        if (files.length === 0) return void 0;
        const file = files[0];
        try {
          await upload(file);
        } catch (e) {
          console.error('Upload failed', e);
        }
      }),
    []
  );
  const handlePaste = useMemo(
    () =>
      executeAsyncTask(async () => {
        const textarea = textareaRef.current;
        if (!textarea) return void 0;
        try {
          const data = await navigator.clipboard.read();
          if (data.length === 0) return void 0;
          const items = await Promise.all(
            data
              .map((it) => {
                const type = it.types
                  .filter((type) => !IGNORE_FILE_TYPE.includes(type))
                  .at(-1);
                if (!type) return null;
                return it.getType(type);
              })
              .filter((it): it is NonNullable<typeof it> => Boolean(it))
          );
          for (const item of items) {
            await upload(new File([item], '', { type: item.type }));
          }
        } catch (e) {
          console.error(e);
        }
      }),
    []
  );
  const handleReceivedTransferData = useCallback(async (files: File[]) => {
    try {
      for (const file of files) {
        await upload(file);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);
  return (
    <section className="section-input">
      <textarea
        ref={textareaRef}
        className="section-input__textarea"
        placeholder="Just write something..."
      ></textarea>
      <div className="section-input__menu">
        <div className="section-input__menu-left">
          <button title="Upload" onClick={handleUpload}>
            <UploadCloudIcon />
          </button>
          <button title="Paste" onClick={handlePaste}>
            <ClipboardPasteIcon />
          </button>
        </div>
        <div className="section-input__menu-right">
          <button title="Send" onClick={handleSend}>
            <span>Send</span>
            <SendIcon />
          </button>
        </div>
      </div>
      <DropZone onReceivedTransferData={handleReceivedTransferData} />
    </section>
  );
});
