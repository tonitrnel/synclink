import { t } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import {
  ArrowLeftRightIcon,
  FileUpIcon,
  FolderUpIcon,
  HardDriveUploadIcon,
} from 'icons';
import {
  forwardRef,
  KeyboardEventHandler,
  ChangeEventHandler,
  MouseEventHandler,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { clsx } from '~/utils/clsx';
import { motion, Variants } from 'framer-motion';

export const MobileInput = forwardRef<
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
  const [expanded, setExpanded] = useState(false);
  const i18n = useLingui();
  const isEmpty = text.length == 0;
  const onFocus = useCallback(() => {
    setExpanded(false);
  }, []);
  useEffect(() => {
    if (!isEmpty) setExpanded(false);
  }, [isEmpty]);
  return (
    <motion.section
      variants={variants}
      initial="closed"
      animate={expanded ? 'opened' : 'closed'}
    >
      <div className="relative flex items-end gap-1">
        <button
          title={t`upload`}
          className="active:bg-gray-200 rounded-xl p-2"
          onClick={onUploadFile}
        >
          <HardDriveUploadIcon className="w-6 h-6 stroke-gray-600 " />
        </button>
        <textarea
          ref={ref}
          value={text}
          onKeyUp={onKeyUp}
          onChange={onChange}
          onFocus={onFocus}
          className="w-auto flex-1 py-1 min-h-0 h-auto"
          rows={1}
        />
        {isEmpty ? (
          <button
            disabled={sending}
            className="text-white rounded p-2 active:bg-opacity-80 select-none"
            onClick={() => setExpanded(!expanded)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="tex"
              strokeWidth="2"
              className={clsx(
                'w-6 h-6 stroke-gray-700 transition-transform',
                expanded && 'rotate-45',
              )}
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M7 12h10" />
              <path d="M12 7v10" />
            </svg>
          </button>
        ) : (
          <button
            disabled={sending}
            className="bg-info-main text-white rounded px-3 py-2 ml-2 active:bg-info-dark active:bg-opacity-80 select-none mb-0.5"
            onClick={onSend}
          >
            {i18n._('Send')}
          </button>
        )}
      </div>
      {expanded && (
        <div className="flex gap-2 pt-6 p-4 box-border justify-around">
          <button className="flex flex-col p-2 gap-2 items-center justify-center text-gray-600 active:text-gray-400">
            <FileUpIcon className="w-6 h-6" />
            <span className="text-xs">{i18n._('Upload file')}</span>
          </button>
          <button className="flex flex-col p-2 gap-2 items-center justify-center text-gray-600 active:text-gray-400">
            <FolderUpIcon className="w-6 h-6" />
            <span className="text-xs">{i18n._('Upload folder')}</span>
          </button>
          <button className="flex flex-col p-2 gap-2 items-center justify-center text-gray-600 active:text-gray-400">
            <ArrowLeftRightIcon className="w-6 h-6" />
            <span className="text-xs">{i18n._('Direct transfer')}</span>
          </button>
        </div>
      )}
    </motion.section>
  );
});

const variants: Variants = {
  opened: {
    height: 120,
  },
  closed: {
    height: 35,
  },
};
