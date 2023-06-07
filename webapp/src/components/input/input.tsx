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
import {
  __CACHE_NAME,
  __CHANNEL,
  __PREFIX,
  IGNORE_FILE_TYPE,
} from '~/constants';
import { Logger } from '~/utils/logger.ts';
import { upload } from '~/utils/upload.ts';
import './input.css';

const logger = new Logger('Input');

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
          logger.error('Seed Failed', e);
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
          logger.error('Upload Failed', e);
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
          logger.error('Pasted Failed', e);
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
      logger.error('Upload Failed', e);
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
    const subscribeBroadcast = () => {
      const broadcastChannel =
        'BroadcastChannel' in self ? new BroadcastChannel(__CHANNEL) : null;
      if (!broadcastChannel) return void 0;
      broadcastChannel.addEventListener('message', (evt) => {
        logger.debug(`[Broadcast]: ${evt.data}`);
      });
      return () => {
        broadcastChannel.close();
      };
    };
    const read = async () => {
      logger.debug(`检测到已接收到的文件 ${location.search}`);
      const cache = await caches.open(__CACHE_NAME);
      logger.debug(`已打开缓存`);
      const requests = await cache.keys();
      logger.debug(`共计 ${requests.length} 项`);
      for (const request of requests) {
        const response = await cache.match(request);
        if (!response) {
          logger.warn(`Invalid cache item = "${request.url}"`);
          continue;
        }
        logger.debug(`处理数据中... url = ${request.url}`);
        const blob = await response.blob();
        const filename =
          response.headers.get('x-raw-filename') ||
          new URL(request.url).pathname.slice(__PREFIX.length + 21); // two `-`, 13-digits timestamp, 6-digits hex index
        const file = new File([blob], decodeURIComponent(filename), {
          type:
            blob.type ||
            response.headers.get('content-type') ||
            'application/octet-stream',
          lastModified: new Date(
            response.headers.get('last-modified') || Date.now()
          ).getTime(),
        });
        await upload(file);
        await cache.delete(request);
        logger.debug(`已删除缓存`);
      }
      const search = new URLSearchParams(location.search);
      search.delete('received');
      search.delete('t');
      search.delete('l');
      search.delete('keys');
      logger.debug(`所有项处理完毕`);
      const url = new URL(location.href);
      url.search = search.size === 0 ? '' : search.toString();
      window.history.replaceState(null, document.title, url);
    };
    if (location.search.includes('received')) {
      read().catch(logger.error);
    }
    return subscribeBroadcast();
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
