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
import {
  forwardRef,
  KeyboardEventHandler,
  ChangeEventHandler,
  MouseEventHandler,
} from 'react';
import { ExtractProps } from '~/constants/types';
import { useDialog } from '~/utils/hooks/use-dialog';
import { DropZone } from '../dropzone';
import { P2pFileTransferDialog } from '../file-transfer-dialog';
import { clsx } from '~/utils/clsx';

export const DesktopInput = forwardRef<
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
    const i18n = useLingui();
    const p2pFileDialog = useDialog(P2pFileTransferDialog);
    return (
      <section className="relative border border-gray-200 rounded-xl p-2">
        {p2pFileDialog.visible && (
          <p2pFileDialog.Dialog {...p2pFileDialog.DialogProps} />
        )}
        <textarea
          ref={ref}
          value={text}
          onKeyUp={onKeyUp}
          onChange={onChange}
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
              onClick={onUploadFile}
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
              onClick={onUploadFolder}
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
              onClick={onPaste}
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
              onClick={onClear}
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
              onClick={onSend}
              disabled={text.length == 0}
            >
              <span className="box-content text-white mr-2">
                {sending ? (
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
        <DropZone onReceivedTransferData={onReceivedTransferData} />
      </section>
    );
  },
);
