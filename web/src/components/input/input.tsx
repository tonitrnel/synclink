import {
  ChangeEventHandler,
  FC,
  forwardRef,
  KeyboardEventHandler,
  memo,
  MouseEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  HardDriveUploadIcon,
  SendIcon,
  XIcon,
  FilesIcon as PasteIcon,
} from 'icons';
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
import { t } from '@lingui/macro';
import { useSnackbar } from '~/components/snackbar';
import { featureCheck } from '~/utils/feature-check.ts';
import { useMediaQuery } from '~/utils/hooks/use-media-query.ts';
import { clamp } from '@painted/shared';
import './input.less';

const logger = new Logger('Input');

export const Input: FC = memo(() => {
  const [text, setText] = useState('');
  const textRef = useRef(text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [sending, setSending] = useState(false);
  const snackbar = useSnackbar();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const handleSend = useMemo(
    () =>
      executeAsyncTask(async () => {
        setSending(true);
        const value = textRef.current.trim();
        if (value.length === 0) return void 0;
        try {
          await upload(new File([value], '', { type: 'text/plain' }));
          setText('');
        } catch (e) {
          logger.error('Seed Failed', e);
          snackbar.enqueueSnackbar({
            message: String(e),
            variant: 'error',
          });
        } finally {
          setSending(false);
        }
      }),
    [snackbar]
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
          featureCheck('clipboard');
        } catch (e) {
          snackbar.enqueueSnackbar({
            message: String(e),
            variant: 'error',
          });
          return void 0;
        }
        try {
          const data = await navigator.clipboard.read();
          if (data.length === 0) {
            snackbar.enqueueSnackbar({
              message: t`paste file is empty`,
              variant: 'warning',
            });
            return void 0;
          }
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
          if (e instanceof Error) {
            if (e.message.includes('No valid data on clipboard')) {
              logger.error('cannot to paste such files');
              snackbar.enqueueSnackbar({
                message: t`cannot to paste such files`,
                variant: 'error',
              });
            } else {
              snackbar.enqueueSnackbar({
                message: e.message,
                variant: 'error',
              });
            }
          } else {
            logger.error('Pasted Failed', e);
          }
        }
      }),
    [snackbar]
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
  const handleReceivedTransferData = useCallback(
    async (files: File[]) => {
      try {
        for (const file of files) {
          await upload(file);
        }
      } catch (e) {
        logger.error('Upload Failed', e);
        snackbar.enqueueSnackbar({
          message: e instanceof Error ? e.message : String(e),
          variant: 'error',
        });
      }
    },
    [snackbar]
  );
  // Register "measure-size" event
  useEffect(() => {
    const textarea = textareaRef.current;
    const container = textarea?.parentElement;
    if (!textarea || !container) return void 0;
    let measureTimer: number | void = void 0;
    const fontSize = 14;
    const lineHeight = 1.5;
    const lineHeightPixels = fontSize * lineHeight;
    const measure = document.createElement('span');
    let initialized = false;
    let previousHeight = 0;
    const initialize = () => {
      measure.className = 'sl-input-measure';
      const computedStyle = window.getComputedStyle(textarea);
      if (!computedStyle.width.trim()) return void 0;
      measure.style.setProperty('font-family', computedStyle.fontFamily);
      measure.style.setProperty('font-size', `${fontSize}px`);
      measure.style.setProperty('line-height', `${lineHeight}`);
      measure.style.setProperty('width', computedStyle.width);
      container.appendChild(measure);
      initialized = true;
    };
    const measureSize = () => {
      if (!initialized) {
        window.requestAnimationFrame(initialize);
        return void 0;
      }
      if (measureTimer) window.cancelAnimationFrame(measureTimer);
      measureTimer = window.requestAnimationFrame(() => {
        const value = textarea.value;
        measure.innerText = textarea.value || ' ';
        const actualHeight =
          measure.offsetHeight + (value.endsWith('\n') ? lineHeightPixels : 0);
        const height = clamp(lineHeightPixels, actualHeight, 300);
        if (
          actualHeight > 300 &&
          textarea.selectionStart === value.length &&
          textarea.scrollHeight > textarea.clientHeight
        ) {
          textarea.scrollTo({ top: textarea.scrollHeight });
        }
        if (previousHeight === height) {
          return void 0;
        }
        previousHeight = height;
        textarea.style.setProperty('height', `${height}px`);
      });
    };
    textarea.addEventListener('measure-size', measureSize);
    window.requestAnimationFrame(initialize);
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
  // Receive share event
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
      logger.debug(`Received files detected ${location.search}`);
      const cache = await caches.open(__CACHE_NAME);
      logger.debug(`Opened cache`);
      const requests = await cache.keys();
      logger.debug(`Total ${requests.length} items.`);
      for (const request of requests) {
        const response = await cache.match(request);
        if (!response) {
          logger.warn(`Invalid cache item = "${request.url}"`);
          continue;
        }
        logger.debug(`Processing... url = ${request.url}`);
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
        logger.debug(`Deleted cache`);
      }
      const search = new URLSearchParams(location.search);
      search.delete('received');
      search.delete('t');
      search.delete('l');
      search.delete('keys');
      logger.debug(`All items processed`);
      const url = new URL(location.href);
      url.search = search.size === 0 ? '' : search.toString();
      window.history.replaceState(null, document.title, url);
    };
    if (location.search.includes('received')) {
      read().catch(logger.error);
    }
    return subscribeBroadcast();
  }, []);
  // rewrite keyboard 'tab' key
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || isMobile) return void 0;
    const handleTabKey = (evt: KeyboardEvent) => {
      if (document.activeElement != textarea) return void 0;
      if (evt.key == 'Tab' && !evt.shiftKey) {
        evt.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;
        const newValue =
          value.substring(0, start) + '    ' + value.substring(end);
        setText(newValue);
        if (end == value.length) return void 0;
        window.requestAnimationFrame(() => {
          textarea.selectionStart = start + 4;
          textarea.selectionEnd = start + 4;
        });
      }
    };
    textarea.addEventListener('keydown', handleTabKey);
    return () => {
      textarea.removeEventListener('keydown', handleTabKey);
    };
  }, [isMobile]);
  // global paste event
  useEffect(() => {
    const listener = async (evt: ClipboardEvent) => {
      const files = evt.clipboardData?.files;
      if (!files || files?.length == 0) return void 0;
      await handleReceivedTransferData([...files]);
    };
    document.addEventListener('paste', listener);
    return () => {
      document.removeEventListener('paste', listener);
    };
  }, [handleReceivedTransferData]);
  if (isMobile)
    return (
      <MobileInput
        ref={textareaRef}
        text={text}
        sending={sending}
        handleKeyUp={handleKeyUp}
        handleChange={handleChange}
        handleUpload={handleUpload}
        handleSend={handleSend}
      />
    );
  return (
    <NonMobileInput
      ref={textareaRef}
      text={text}
      sending={sending}
      handleKeyUp={handleKeyUp}
      handleChange={handleChange}
      handleUpload={handleUpload}
      handleSend={handleSend}
      handleClear={handleClear}
      handlePaste={handlePaste}
      handleReceivedTransferData={handleReceivedTransferData}
    />
  );
});

const MobileInput = forwardRef<
  HTMLTextAreaElement,
  {
    text: string;
    sending: boolean;
    handleKeyUp: KeyboardEventHandler<HTMLTextAreaElement>;
    handleChange: ChangeEventHandler<HTMLTextAreaElement>;
    handleUpload: MouseEventHandler<HTMLButtonElement>;
    handleSend: MouseEventHandler<HTMLButtonElement>;
  }
>(
  (
    { text, sending, handleKeyUp, handleChange, handleUpload, handleSend },
    ref
  ) => {
    return (
      <section className="relative flex items-end gap-1">
        <button
          title={t`upload`}
          className="active:bg-gray-200 rounded-xl p-2 -ml-2"
          onClick={handleUpload}
        >
          <HardDriveUploadIcon className="w-6 h-6 stroke-gray-600 " />
        </button>
        <textarea
          ref={ref}
          value={text}
          onKeyUp={handleKeyUp}
          onChange={handleChange}
          className="sl-textarea w-auto flex-1 py-2 min-h-0 h-auto"
          rows={1}
        />
        <button
          disabled={sending}
          className="bg-info-main text-white rounded px-3 py-2 ml-2 active:bg-info-dark active:bg-opacity-80 select-none mb-0.5"
          onClick={handleSend}
        >
          {t`send`}
        </button>
      </section>
    );
  }
);
const NonMobileInput = forwardRef<
  HTMLTextAreaElement,
  {
    text: string;
    sending: boolean;
    handleKeyUp: KeyboardEventHandler<HTMLTextAreaElement>;
    handleChange: ChangeEventHandler<HTMLTextAreaElement>;
    handleUpload: MouseEventHandler<HTMLButtonElement>;
    handlePaste: MouseEventHandler<HTMLButtonElement>;
    handleClear: MouseEventHandler<HTMLButtonElement>;
    handleSend: MouseEventHandler<HTMLButtonElement>;
    handleReceivedTransferData: (files: File[]) => Promise<void>;
  }
>(
  (
    {
      text,
      sending,
      handleKeyUp,
      handleChange,
      handleUpload,
      handlePaste,
      handleClear,
      handleSend,
      handleReceivedTransferData,
    },
    ref
  ) => {
    return (
      <section className="relative">
        <textarea
          ref={ref}
          value={text}
          onKeyUp={handleKeyUp}
          onChange={handleChange}
          className="sl-textarea"
          rows={1}
        />
        <div className="flex mt-4 items-center justify-between">
          <div className="flex gap-2">
            <button
              title={t`upload`}
              className="sl-button p-3 rounded-lg"
              onClick={handleUpload}
            >
              <HardDriveUploadIcon className="w-6 h-6 stroke-gray-500" />
            </button>
            <button
              title={t`paste`}
              className="sl-button p-3 rounded-lg "
              onClick={handlePaste}
            >
              <PasteIcon className="w-6 h-6 stroke-gray-500" />
            </button>
          </div>
          <div className="flex gap-2">
            <button
              title="Clear"
              hidden={text.length === 0}
              onClick={handleClear}
              className="text-gray-500 hover:text-gray-600 cursor-pointer"
            >
              <XIcon className="w-6 h-6 stroke-currentColor" />
            </button>
            <button
              title="Send (Ctrl + Enter)"
              onClick={handleSend}
              className="sl-button sl-button-with-icon flex items-center rounded-lg overflow-hidden"
            >
              <span className="py-3 h-6 px-6 box-content text-gray-600 leading-snug">
                {sending ? (
                  <>
                    <span>{t`sending`}</span>
                    <span className="ani_dot">...</span>
                  </>
                ) : (
                  <span>{t`send`}</span>
                )}
              </span>
              <SendIcon className="p-3 box-content w-6 h-6 stroke-gray-500" />
            </button>
          </div>
        </div>
        <DropZone onReceivedTransferData={handleReceivedTransferData} />
      </section>
    );
  }
);
