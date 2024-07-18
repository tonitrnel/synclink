import {
  ChangeEventHandler,
  FC,
  forwardRef,
  KeyboardEventHandler,
  memo,
  MouseEventHandler,
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
  ArrowLeftRightIcon,
  FileUpIcon,
  FolderUpIcon,
} from 'icons';
import { DropZone, FilesOrEntries } from '../dropzone';
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
import { useSnackbar } from '~/components/snackbar';
import { featureCheck } from '~/utils/feature-check.ts';
import { useMediaQuery } from '~/utils/hooks/use-media-query.ts';
import { ExtractProps } from '~/constants/types.ts';
import { InputTextarea } from 'primereact/inputtextarea';
import type { TooltipOptions } from 'primereact/tooltip/tooltipoptions';
import { Button } from 'primereact/button';
import { P2pFileDeliveryDialog } from '~/components/file-delivery-dialog';
import { FileUploadDialog } from '../file-upload-dialog';
import { useDialog } from '~/utils/hooks/use-dialog.ts';
import './input.less';

const logger = new Logger('Input');

export const Input: FC = memo(() => {
  const [text, setText] = useState('');
  const textRef = useRef(text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [sending, setSending] = useState(false);
  const snackbar = useSnackbar();
  const isMobile = useMediaQuery(useMediaQuery.MOBILE_QUERY);
  const fileUploadDialog = useDialog(FileUploadDialog);
  const handler = useMemo(
    () =>
      new (class InputHandler {
        send = executeAsyncTask(async () => {
          const value = textRef.current.trim();
          if (value.length === 0) return void 0;
          setSending(true);
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
        });
        uploadFile = executeAsyncTask(async () => {
          const files = await openFilePicker(['*'], true);
          if (files.length === 0) return void 0;
          const file = files[0];
          try {
            await upload(file);
          } catch (e) {
            logger.error('Upload Failed', e);
          }
        });
        uploadFolder = executeAsyncTask(async () => {
          const files = await openFilePicker(['*'], false, true);
          if (files.length === 0) return void 0;
          const file = files[0];
          try {
            await upload(file);
          } catch (e) {
            logger.error('Upload Failed', e);
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
        receivedTransferData = async (filesOrEntries: FilesOrEntries) => {
          try {
            if (filesOrEntries.type == 'multi-file') {
              for (const file of filesOrEntries.files) {
                await upload(file);
              }
            } else {
              await upload(filesOrEntries.entries);
            }
          } catch (e) {
            logger.error('Upload Failed', e);
            snackbar.enqueueSnackbar({
              message: e instanceof Error ? e.message : String(e),
              variant: 'error',
            });
          }
        };
      })(),
    [snackbar],
  );
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
      await handler.receivedTransferData({
        type: 'multi-file',
        files: [...files],
      });
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

const MobileInput = forwardRef<
  HTMLTextAreaElement,
  {
    text: string;
    sending: boolean;
    onKeyUp: KeyboardEventHandler<HTMLTextAreaElement>;
    onChange: ChangeEventHandler<HTMLTextAreaElement>;
    onUploadFile: MouseEventHandler<HTMLButtonElement>;
    onSend: MouseEventHandler<HTMLButtonElement>;
  }
>(({ text, sending, onKeyUp, onChange, onUploadFile, onSend }, ref) => {
  return (
    <section className="relative flex items-end gap-1">
      <button
        title={t`upload`}
        className="active:bg-gray-200 rounded-xl p-2 -ml-2"
        onClick={onUploadFile}
      >
        <HardDriveUploadIcon className="w-6 h-6 stroke-gray-600 " />
      </button>
      <textarea
        ref={ref}
        value={text}
        onKeyUp={onKeyUp}
        onChange={onChange}
        className="sl-textarea w-auto flex-1 py-2 min-h-0 h-auto"
        rows={1}
      />
      <button
        disabled={sending}
        className="bg-info-main text-white rounded px-3 py-2 ml-2 active:bg-info-dark active:bg-opacity-80 select-none mb-0.5"
        onClick={onSend}
      >
        {t`send`}
      </button>
    </section>
  );
});
const DesktopInput = forwardRef<
  HTMLTextAreaElement,
  {
    text: string;
    sending: boolean;
    onKeyUp: KeyboardEventHandler<HTMLTextAreaElement>;
    onChange: ChangeEventHandler<HTMLTextAreaElement>;
    onUploadFile: MouseEventHandler<HTMLButtonElement>;
    onUploadFolder: MouseEventHandler<HTMLButtonElement>;
    onPaste: MouseEventHandler<HTMLButtonElement>;
    onClear: MouseEventHandler<HTMLButtonElement>;
    onSend: MouseEventHandler<HTMLButtonElement>;
    onReceivedTransferData: ExtractProps<
      typeof DropZone
    >['onReceivedTransferData'];
  }
>(
  (
    {
      text,
      sending,
      onKeyUp,
      onChange,
      onUploadFile,
      onUploadFolder,
      onPaste,
      onClear,
      onSend,
      onReceivedTransferData,
    },
    ref,
  ) => {
    const p2pFileDialog = useDialog(P2pFileDeliveryDialog);
    return (
      <section className="relative border border-gray-200 rounded-xl p-2">
        {p2pFileDialog.visible && (
          <p2pFileDialog.Dialog {...p2pFileDialog.DialogProps} />
        )}
        <InputTextarea
          ref={ref}
          value={text}
          onKeyUp={onKeyUp}
          onChange={onChange}
          className="w-full border-none shadow-none"
          placeholder="Enter your message here..."
          autoResize
          rows={2}
        />
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button
              tooltip={t`upload file`}
              tooltipOptions={ButtonTooltipOptionsObj}
              className="p-2 rounded-lg"
              onClick={onUploadFile}
              severity="secondary"
              text
            >
              <FileUpIcon className="w-5 h-5 stroke-grey-600" />
            </Button>
            <Button
              tooltip={t`upload folder`}
              tooltipOptions={ButtonTooltipOptionsObj}
              className="p-2 rounded-lg"
              onClick={onUploadFolder}
              severity="secondary"
              text
            >
              <FolderUpIcon className="w-5 h-5 stroke-grey-600" />
            </Button>
            <Button
              tooltip={t`paste`}
              tooltipOptions={ButtonTooltipOptionsObj}
              className="p-2 rounded-lg"
              onClick={onPaste}
              severity="secondary"
              text
            >
              <PasteIcon className="w-5 h-5 stroke-grey-600" />
            </Button>
            <Button
              tooltip={t`peer to peer file delivery`}
              tooltipOptions={ButtonTooltipOptionsObj}
              className="p-2 rounded-lg"
              severity="secondary"
              onClick={() => p2pFileDialog.open()}
              text
            >
              <ArrowLeftRightIcon className="w-5 h-5 stroke-grey-600" />
            </Button>
          </div>
          <div className="flex gap-2">
            <button
              title="Clear"
              hidden={text.length === 0}
              onClick={onClear}
              className="text-gray-500 hover:text-gray-600 cursor-pointer"
            >
              <XIcon className="w-5 h-5 stroke-currentColor" />
            </button>
            <Button
              severity="secondary"
              title="Send (Ctrl + Enter)"
              onClick={onSend}
            >
              <span className="box-content text-white mr-2">
                {sending ? (
                  <>
                    <span>{t`sending`}</span>
                    <span className="ani_dot">...</span>
                  </>
                ) : (
                  <span>{t`send`}</span>
                )}
              </span>
              <SendIcon className="box-content w-5 h-5 stroke-white" />
            </Button>
          </div>
        </div>
        <DropZone onReceivedTransferData={onReceivedTransferData} />
      </section>
    );
  },
);

const ButtonTooltipOptionsObj = {
  position: 'bottom',
  showDelay: 1000,
  hideDelay: 300,
} satisfies TooltipOptions;
