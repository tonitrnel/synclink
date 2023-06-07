import {
  ChangeEventHandler,
  FC,
  KeyboardEventHandler,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ReactComponent as UploadCloudIcon } from '~/assets/upload-cloud.svg';
import { ReactComponent as SendIcon } from '~/assets/send.svg';
import { ReactComponent as CloseIcon } from '~/assets/x.svg';
import { ReactComponent as ClipboardPasteIcon } from '~/assets/clipboard-paste.svg';
import { DropZone } from '../dropzone';
import { executeAsyncTask } from '~/utils/execute-async-task.ts';
import { openFilePicker } from '~/utils/open-file-picker.ts';
import { IGNORE_FILE_TYPE } from '~/constants';
import { upload } from '~/utils/upload.ts';
import './input.css';

export const Input: FC = memo(() => {
  const [text, setText] = useState('');
  const textRef = useRef(text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const handleSend = useMemo(
    () =>
      executeAsyncTask(async () => {
        const value = textRef.current.trim();
        if (value.length === 0) return void 0;
        try {
          await upload(new File([value], '', { type: 'text/plain' }));
          setText('');
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
              .reverse()
          );
          const item = items[0];
          if (item.type.startsWith('text/')) {
            setText(await item.text().then((text) => text.trim()));
            textareaRef.current?.focus();
          } else {
            await upload(new File([item], '', { type: item.type }));
          }
        } catch (e) {
          console.error(e);
        }
      }),
    []
  );
  const handleKeyUp = useMemo<KeyboardEventHandler>(
    () =>
      executeAsyncTask(async (evt) => {
        if (evt.ctrlKey && evt.key === 'Enter') {
          evt.preventDefault();
          await handleSend();
        }
      }),
    [handleSend]
  );
  const handleClear = useCallback(() => {
    setText('');
  }, []);
  const handleChange = useCallback<ChangeEventHandler<HTMLTextAreaElement>>(
    (evt) => {
      setText(evt.target.value);
    },
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
  // Register "measure-size" event
  useEffect(() => {
    const textarea = textareaRef.current;
    const container = textarea?.parentElement;
    if (!textarea || !container) return void 0;
    const measure = document.createElement('span');
    measure.className = 'input-measure';
    const computedStyle = window.getComputedStyle(textarea);
    measure.style.setProperty('font-family', computedStyle.fontFamily);
    measure.style.setProperty('width', computedStyle.width);
    let measureTimer: number | void = void 0;
    const lineHeight = 12 * 1.5;
    container.appendChild(measure);
    const measureSize = () => {
      if (measureTimer) window.cancelAnimationFrame(measureTimer);
      measureTimer = window.requestAnimationFrame(() => {
        const value = textarea.value;
        measure.innerText = textarea.value || ' ';
        const height = Math.max(
          measure.offsetHeight + (value.endsWith('\n') ? lineHeight : 0),
          lineHeight
        );
        textarea.style.setProperty('height', `${height}px`);
        if (
          textarea.selectionStart === value.length &&
          textarea.scrollHeight > textarea.clientHeight
        ) {
          textarea.scrollTo({ top: textarea.scrollHeight });
        }
      });
    };
    textarea.addEventListener('measure-size', measureSize);
    return () => {
      container.removeChild(measure);
      textarea.removeEventListener('measure-size', measureSize);
    };
  }, []);
  // Dispatch the "measure-size" event and update text ref when the text change
  useEffect(() => {
    textRef.current = text;
    textareaRef.current?.dispatchEvent(new CustomEvent('measure-size'));
  }, [text]);
  useEffect(() => {
    const read = async () => {
      const keys = await caches.keys();
      const mediaCache = await caches.open(
        keys.filter((key) => key.startsWith('media'))[0]
      );
      const content = await mediaCache.match('shared-content');
      if (content) {
        const formData = await content.formData();
        console.log(formData);
      } else {
        console.log('shared content is empty');
      }
    };
    if (location.search.includes('share-target')) {
      read().catch(console.error);
    }
  }, []);
  return (
    <section className="section-input">
      <textarea
        ref={textareaRef}
        value={text}
        onKeyUp={handleKeyUp}
        onChange={handleChange}
        className="section-input__textarea"
        placeholder="Just write something..."
      ></textarea>
      <div className="section-input__menu">
        <div className="section-input__menu-left">
          <button title="Upload" data-btn-typ="default" onClick={handleUpload}>
            <UploadCloudIcon />
          </button>
          <button title="Paste" data-btn-typ="default" onClick={handlePaste}>
            <ClipboardPasteIcon />
          </button>
        </div>
        <div className="section-input__menu-right">
          <button
            data-btn-typ="text"
            title="Clear"
            disabled={text.length === 0}
            onClick={handleClear}
          >
            <CloseIcon />
          </button>
          <button
            data-btn-typ="default"
            title="Send (Ctrl + C)"
            onClick={handleSend}
          >
            <span>Send</span>
            <SendIcon />
          </button>
        </div>
      </div>
      <DropZone onReceivedTransferData={handleReceivedTransferData} />
    </section>
  );
});
