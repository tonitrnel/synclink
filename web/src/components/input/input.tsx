import {
  ChangeEventHandler,
  FC,
  KeyboardEventHandler,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { executeAsyncTask } from '~/utils/execute-async-task.ts';
import { openFilePicker } from '~/utils/open-file-picker.ts';
import {
  __CACHE_NAME__,
  __CHANNEL__,
  __PREFIX__,
  IGNORE_FILE_TYPE,
} from '~/constants';
import { Logger } from '~/utils/logger.ts';
import { upload } from '~/utils/upload.ts';
import { t } from '@lingui/macro';
import { useSnackbar } from '~/components/ui/snackbar';
import { featureCheck } from '~/utils/feature-check.ts';
import { useMediaQuery } from '~/utils/hooks/use-media-query.ts';
import { FilesOrEntries } from '~/constants/types.ts';
import { FileUploadDialog } from '../file-upload-dialog';
import { useDialog } from '~/utils/hooks/use-dialog.ts';
import { MobileInput } from './mobile-input';
import { DesktopInput } from './desktop-input';
import { clsx } from '~/utils/clsx';
import './input.less';

const logger = new Logger('Input');

export const Input: FC = memo(() => {
  const [text, setText] = useState('');
  const textRef = useRef(text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [sending, setSending] = useState(false);
  const snackbar = useSnackbar();
  const isMobile = useMediaQuery(useMediaQuery.MOBILE_QUERY);
  const fileUploadDialog = useDialog(FileUploadDialog, {
    onClose: (values) => values,
  });
  const handler = useMemo(
    () =>
      new (class InputHandler {
        send = executeAsyncTask(async () => {
          const value = textRef.current.trim();
          if (value.length === 0) return void 0;
          setSending(true);
          try {
            await upload({
              type: 'multi-file',
              files: [new File([value], '', { type: 'text/plain' })],
            });
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
        });
        uploadFile = executeAsyncTask(async () => {
          const files = await openFilePicker(['*'], true);
          if (files.length === 0) return void 0;
          fileUploadDialog.open({
            mode: 'file',
            filesOrEntries: {
              type: 'multi-file',
              files,
            },
          });
          const value = await fileUploadDialog.awaitClose();
          if (!value) return void 0;
          try {
            await upload(value.entries, value.caption, value.tags);
          } catch (e) {
            logger.error('Upload Failed', e);
            snackbar.enqueueSnackbar({
              message: String(e),
              variant: 'error',
            });
          }
        });
        uploadFolder = executeAsyncTask(async () => {
          const files = await openFilePicker(['*'], false, true);
          if (files.length === 0) return void 0;
          fileUploadDialog.open({
            mode: 'directory',
            filesOrEntries: {
              type: 'multi-file',
              files,
            },
          });
          const value = await fileUploadDialog.awaitClose();
          if (!value) return void 0;
          try {
            await upload(value.entries, value.caption, value.tags);
          } catch (e) {
            logger.error('Upload Failed', e);
            snackbar.enqueueSnackbar({
              message: String(e),
              variant: 'error',
            });
          }
        });
        paste = executeAsyncTask(async () => {
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
                .reverse(),
            );
            const item = items[0];
            if (item.type.startsWith('text/')) {
              setText(await item.text().then((text) => text.trim()));
              textareaRef.current?.focus();
            } else {
              await upload({
                type: 'multi-file',
                files: [new File([item], '', { type: item.type })],
              });
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
        });
        keyup = executeAsyncTask<KeyboardEventHandler>(async (evt) => {
          if (evt.ctrlKey && evt.key === 'Enter') {
            evt.preventDefault();
            await this.send();
          }
        });
        clear = () => {
          setText('');
        };
        change: ChangeEventHandler<HTMLTextAreaElement> = (evt) => {
          setText(evt.target.value);
        };
        receivedTransferData = async (
          filesOrEntries: FilesOrEntries,
          from: 'drop' | 'paste',
        ) => {
          if (
            from == 'paste' &&
            filesOrEntries.type == 'multi-file' &&
            filesOrEntries.files.length == 1 &&
            filesOrEntries.files[0].size < 2097152 &&
            filesOrEntries.files[0].type.startsWith('image/')
          ) {
            try {
              await upload(filesOrEntries, undefined, undefined);
            } catch (e) {
              logger.error('Upload Failed', e);
              snackbar.enqueueSnackbar({
                message: e instanceof Error ? e.message : String(e),
                variant: 'error',
              });
            }
          } else {
            fileUploadDialog.open({
              mode: filesOrEntries.type == 'multi-file' ? 'file' : 'directory',
              filesOrEntries,
            });
            const value = await fileUploadDialog.awaitClose();
            if (!value) return void 0;
            try {
              await upload(value.entries, value.caption, value.tags);
            } catch (e) {
              logger.error('Upload Failed', e);
              snackbar.enqueueSnackbar({
                message: e instanceof Error ? e.message : String(e),
                variant: 'error',
              });
            }
          }
        };
      })(),
    [fileUploadDialog, snackbar],
  );
  // Register "measure-size" event
  useEffect(() => {
    const textarea = textareaRef.current;
    const container = textarea?.parentElement;
    if (!textarea || !container) return void 0;
    let measureTimer: number | void = void 0;
    const measure = document.createElement('div');
    measure.className = textarea.className;
    let initialized = false;
    let unmounted = false;
    let previousHeight = 0;
    const initialize = () => {
      if (unmounted) return void 0;
      measure.className = clsx(
        textarea.className,
        'absolute overflow-y-auto whitespace-pre-wrap -z-50 left-0 top-0 pointer-events-none invisible',
      );
      const computedStyle = window.getComputedStyle(textarea);
      if (!computedStyle.width.trim()) return void 0;
      measure.style.setProperty('width', computedStyle.width);
      measure.style.setProperty('height', computedStyle.height);
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
        measure.innerText = value.endsWith('\n') ? value + ' ' : value || ' ';
        const measureHeight =  measure.scrollHeight;
        const height = Math.min(measureHeight, 300);
        if (
          measureHeight > 300 &&
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
      unmounted = true;
      if (initialized) container.removeChild(measure);
      textarea.removeEventListener('measure-size', measureSize);
      if (measureTimer) window.cancelAnimationFrame(measureTimer);
      measureTimer = void 0;
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
        'BroadcastChannel' in self ? new BroadcastChannel(__CHANNEL__) : null;
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
      const cache = await caches.open(__CACHE_NAME__);
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
          new URL(request.url).pathname.slice(__PREFIX__.length + 21); // two `-`, 13-digits timestamp, 6-digits hex index
        const file = new File([blob], decodeURIComponent(filename), {
          type:
            blob.type ||
            response.headers.get('content-type') ||
            'application/octet-stream',
          lastModified: new Date(
            response.headers.get('last-modified') || Date.now(),
          ).getTime(),
        });
        await upload({ type: 'multi-file', files: [file] });
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
      await handler.receivedTransferData(
        {
          type: 'multi-file',
          files: [...files],
        },
        'paste',
      );
    };
    document.addEventListener('paste', listener);
    return () => {
      document.removeEventListener('paste', listener);
    };
  }, [handler]);
  return (
    <>
      {isMobile ? (
        <MobileInput
          ref={textareaRef}
          text={text}
          sending={sending}
          onKeyUp={handler.keyup}
          onChange={handler.change}
          onUploadFile={handler.uploadFile}
          onSend={handler.uploadFolder}
        />
      ) : (
        <DesktopInput
          ref={textareaRef}
          text={text}
          sending={sending}
          onKeyUp={handler.keyup}
          onChange={handler.change}
          onUploadFile={handler.uploadFile}
          onUploadFolder={handler.uploadFolder}
          onSend={handler.send}
          onClear={handler.clear}
          onPaste={handler.paste}
          onReceivedTransferData={handler.receivedTransferData}
        />
      )}
      {fileUploadDialog.visible && (
        <FileUploadDialog {...fileUploadDialog.DialogProps} />
      )}
    </>
  );
});
