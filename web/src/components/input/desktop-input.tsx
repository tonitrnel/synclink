import { useLingui } from '@lingui/react';
import {
  FileUpIcon,
  FolderUpIcon,
  ArrowLeftRightIcon,
  XIcon,
  SendIcon,
  FilesIcon as PasteIcon,
} from 'lucide-react';
import { Button } from '~/components/ui/button';
import { forwardRef, useRef, useEffect, HTMLAttributes } from 'react';
import { useDialog } from '~/utils/hooks/use-dialog';
import { DropZone } from '../dropzone';
import { clsx } from '~/utils/clsx';
import { FileUploadDialog } from '~/components/file-upload-dialog';
import { useComposedRefs } from '~/utils/hooks/use-compose-refs.ts';
import { useInputLogic } from './hooks/use-input-logic.ts';
import {
  dispatchMeasureSizeEvent,
  useMeasureSize,
} from './hooks/use-measure-size.ts';
import { useRecvShareEvent } from './hooks/use-recv-share-event.ts';
import { useTabkeyRewrite } from './hooks/use-tabkey-rewrite.ts';
import { usePasteEvent } from './hooks/use-paste-event.ts';
import { openFileTransfer } from '~/components/file-transfer-dialog';

export const DesktopInput = forwardRef<
  HTMLTextAreaElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composedRefs = useComposedRefs(textareaRef, ref);
  const i18n = useLingui();
  const fileUploadDialog = useDialog(FileUploadDialog, {
    onClose: (values) => values,
  });
  const { text, setText, handlers, transmitting, transmittable } =
    useInputLogic(textareaRef, async ({ mode, filesOrEntries }) => {
      fileUploadDialog.open({
        mode,
        filesOrEntries,
      });
      return fileUploadDialog.awaitClose();
    });
  useMeasureSize(textareaRef);
  useEffect(() => {
    dispatchMeasureSizeEvent(textareaRef.current!);
  }, [text]);
  useRecvShareEvent();
  useTabkeyRewrite(textareaRef, setText);
  usePasteEvent(handlers.receivedTransferData);
  return (
    <section
      className={clsx(
        'relative rounded-xl border border-gray-200 p-2',
        className,
      )}
      {...props}
    >
      {fileUploadDialog.visible && (
        <FileUploadDialog {...fileUploadDialog.DialogProps} />
      )}
      <textarea
        ref={composedRefs}
        value={text}
        onKeyUp={handlers.keyup}
        onChange={handlers.change}
        className="w-full resize-none appearance-none rounded-md border-none p-3 text-sm shadow-none outline-none outline-0"
        placeholder={i18n._('Enter your message here...')}
        rows={2}
      />
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            type="button"
            aria-label={i18n._('Upload file')}
            tooltip={i18n._('Upload file')}
            className="rounded-lg p-2"
            onClick={handlers.uploadFile}
            variant="ghost"
            size="icon"
          >
            <FileUpIcon className="h-4 w-4 stroke-gray-600" />
          </Button>
          <Button
            type="button"
            aria-label={i18n._('Upload folder')}
            tooltip={i18n._('Upload folder')}
            className="rounded-lg p-2"
            onClick={handlers.uploadFolder}
            variant="ghost"
            size="icon"
          >
            <FolderUpIcon className="h-4 w-4 stroke-gray-600" />
          </Button>
          <Button
            type="button"
            aria-label={i18n._('Paste')}
            tooltip={i18n._('Paste')}
            className="rounded-lg p-2"
            onClick={handlers.paste}
            variant="ghost"
            size="icon"
          >
            <PasteIcon className="h-4 w-4 stroke-gray-600" />
          </Button>
          <Button
            type="button"
            aria-label={i18n._('Peer to peer file transfer')}
            tooltip={i18n._('Peer to peer file transfer')}
            className="rounded-lg p-2"
            variant="ghost"
            size="icon"
            onClick={() => openFileTransfer({ mode: 'sender' })}
          >
            <ArrowLeftRightIcon className="h-4 w-4 stroke-gray-600" />
          </Button>
        </div>
        <div className="mr-2 flex gap-2">
          <button
            type="button"
            aria-label={i18n._('Clear')}
            onClick={handlers.clear}
            className={clsx(
              'cursor-pointer text-gray-500 hover:text-gray-600',
              text.length == 0 && 'hidden',
            )}
          >
            <XIcon className="h-4 w-4 stroke-current" />
          </button>
          <Button
            type="button"
            title={i18n._('Send (Ctrl + Enter)')}
            onClick={handlers.send}
            disabled={!transmittable}
          >
            <span className="mr-2 box-content text-white">
              {transmitting ? (
                <>
                  <span>{i18n._('Sending')}</span>
                  <span className="ani_dot">...</span>
                </>
              ) : (
                <span>{i18n._('Send')}</span>
              )}
            </span>
            <SendIcon className="box-content h-5 w-5 stroke-white" />
          </Button>
        </div>
      </div>
      <DropZone onReceivedTransferData={handlers.receivedTransferData} />
    </section>
  );
});
