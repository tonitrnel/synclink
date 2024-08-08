import { useLingui } from '@lingui/react';
import {
  FileUpIcon,
  FolderUpIcon,
  ArrowLeftRightIcon,
  XIcon,
  SendIcon,
  FilesIcon as PasteIcon,
} from 'icons';
import { Button } from '~/components/ui/button';
import { forwardRef, useRef, useEffect, HTMLAttributes } from 'react';
import { useDialog } from '~/utils/hooks/use-dialog';
import { DropZone } from '../dropzone';
import { P2pFileTransferDialog } from '../file-transfer-dialog';
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

export const DesktopInput = forwardRef<
  HTMLTextAreaElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composedRefs = useComposedRefs(textareaRef, ref);
  const i18n = useLingui();
  const p2pFileDialog = useDialog(P2pFileTransferDialog);
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
        'relative border border-gray-200 rounded-xl p-2',
        className,
      )}
      {...props}
    >
      {p2pFileDialog.visible && (
        <p2pFileDialog.Dialog {...p2pFileDialog.DialogProps} />
      )}
      {fileUploadDialog.visible && (
        <FileUploadDialog {...fileUploadDialog.DialogProps} />
      )}
      <textarea
        ref={composedRefs}
        value={text}
        onKeyUp={handlers.keyup}
        onChange={handlers.change}
        className="w-full border-none shadow-none resize-none p-3 outline-none outline-0 rounded-md appearance-none text-sm"
        placeholder={i18n._('Enter your message here...')}
        rows={2}
      />
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            type="button"
            aria-label={i18n._('Upload file')}
            tooltip={i18n._('Upload file')}
            className="p-2 rounded-lg"
            onClick={handlers.uploadFile}
            variant="ghost"
            size="icon"
          >
            <FileUpIcon className="w-4 h-4 stroke-gray-600" />
          </Button>
          <Button
            type="button"
            aria-label={i18n._('Upload folder')}
            tooltip={i18n._('Upload folder')}
            className="p-2 rounded-lg"
            onClick={handlers.uploadFolder}
            variant="ghost"
            size="icon"
          >
            <FolderUpIcon className="w-4 h-4 stroke-gray-600" />
          </Button>
          <Button
            type="button"
            aria-label={i18n._('Paste')}
            tooltip={i18n._('Paste')}
            className="p-2 rounded-lg"
            onClick={handlers.paste}
            variant="ghost"
            size="icon"
          >
            <PasteIcon className="w-4 h-4 stroke-gray-600" />
          </Button>
          <Button
            type="button"
            aria-label={i18n._('Peer to peer file transfer')}
            tooltip={i18n._('Peer to peer file transfer')}
            className="p-2 rounded-lg"
            variant="ghost"
            size="icon"
            onClick={() => p2pFileDialog.open()}
          >
            <ArrowLeftRightIcon className="w-4 h-4 stroke-gray-600" />
          </Button>
        </div>
        <div className="flex gap-2 mr-2">
          <button
            type="button"
            aria-label={i18n._('Clear')}
            onClick={handlers.clear}
            className={clsx(
              'text-gray-500 hover:text-gray-600 cursor-pointer',
              text.length == 0 && 'hidden',
            )}
          >
            <XIcon className="w-4 h-4 stroke-current" />
          </button>
          <Button
            type="button"
            title={i18n._('Send (Ctrl + Enter)')}
            onClick={handlers.send}
            disabled={!transmittable}
          >
            <span className="box-content text-white mr-2">
              {transmitting ? (
                <>
                  <span>{i18n._('Sending')}</span>
                  <span className="ani_dot">...</span>
                </>
              ) : (
                <span>{i18n._('Send')}</span>
              )}
            </span>
            <SendIcon className="box-content w-5 h-5 stroke-white" />
          </Button>
        </div>
      </div>
      <DropZone onReceivedTransferData={handlers.receivedTransferData} />
    </section>
  );
});
