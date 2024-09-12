import { useLingui } from '@lingui/react';
import { ArrowLeftRightIcon, FileUpIcon, SendHorizonalIcon } from 'icons';
import { forwardRef, useEffect, useRef, HTMLAttributes } from 'react';
import { clsx } from '~/utils/clsx';
import { useComposedRefs } from '~/utils/hooks/use-compose-refs.ts';
import { useInputLogic } from './hooks/use-input-logic.ts';
import {
  dispatchMeasureSizeEvent,
  useMeasureSize,
} from './hooks/use-measure-size.ts';
import { useRecvShareEvent } from './hooks/use-recv-share-event.ts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { openFileTransfer } from '~/components/file-transfer-dialog';
import FileUploadPage from '~/pages/mobile/file-upload';
import { useNavigate } from 'react-router-dom';

export const MobileInput = forwardRef<
  HTMLTextAreaElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composedRefs = useComposedRefs(textareaRef, ref);
  const navigate = useNavigate();
  const { text, handlers, transmitting, transmittable } = useInputLogic(
    textareaRef,
    async ({ mode, filesOrEntries }) => {
      await new Promise<void>((resolve, reject) => {
        let ready = false;
        const timer = window.setTimeout(() => {
          if (ready) return void 0;
          reject(new Error('Failed open upload page, reason: timeout'));
        }, 1000);
        FileUploadPage.signal.once('ready', () => {
          ready = true;
          window.clearTimeout(timer);
          resolve();
        });
        navigate('/file-upload');
      });
      FileUploadPage.signal.emit('enter', {
        mode,
        filesOrEntries,
      });
      return new Promise((resolve) => {
        FileUploadPage.signal.on('exit', resolve);
      });
    },
  );
  const i18n = useLingui();
  useMeasureSize(textareaRef);
  useEffect(() => {
    dispatchMeasureSizeEvent(textareaRef.current!);
  }, [text]);
  useRecvShareEvent();
  return (
    <div className={clsx('mb-6 w-full pt-3', className)} {...props}>
      <div className="relative flex items-end gap-1">
        <div className="flex h-[2.785rem] items-center">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded p-2 active:bg-gray-200"
                type="button"
                aria-label={i18n._('More')}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="tex"
                  strokeWidth="2"
                  className={clsx('h-6 w-6 stroke-gray-700')}
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M7 12h10" />
                  <path d="M12 7v10" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                key="Upload file"
                onClick={handlers.uploadFile}
                className="flex items-center gap-1 [&>svg]:text-gray-600"
                aria-label={i18n._('Upload file')}
              >
                <FileUpIcon className="h-4 w-4" />
                <span>{i18n._('Upload file')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                key="Direct transfer"
                onClick={() => openFileTransfer({ mode: 'sender' })}
                className="flex items-center gap-1 p-2 [&>svg]:text-gray-600"
                aria-label={i18n._('Direct transfer')}
              >
                <ArrowLeftRightIcon className="h-4 w-4" />
                <span>{i18n._('Direct transfer')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <textarea
          ref={composedRefs}
          value={text}
          onChange={handlers.change}
          className="h-full w-auto flex-1 resize-none appearance-none border-none bg-gray-100 p-3 text-sm shadow-none outline-none outline-0"
          rows={1}
        />
        <div className="flex h-[2.785rem] items-center">
          <button
            className="select-none rounded p-2 text-indigo-600 active:bg-gray-200 active:text-indigo-800 disabled:text-gray-300"
            disabled={transmitting || !transmittable}
            onClick={handlers.send}
            aria-label={i18n._('Send')}
          >
            <SendHorizonalIcon className="h-6 w-6 fill-current stroke-background stroke-1" />
          </button>
        </div>
      </div>
    </div>
  );
});
