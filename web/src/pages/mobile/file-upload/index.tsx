import { EventBus } from '~/utils/event-bus.ts';
import { FilesOrEntries } from '~/constants/types.ts';
import {
  FC,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { AnimationPage } from '~/components/animation-page';
import { useLingui } from '@lingui/react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FormValue,
  useFileUploadLogic,
} from '~/components/file-upload-dialog/logic.ts';
import { FileUploadImpl } from '~/components/file-upload-dialog';
import { Button } from '~/components/ui/button';
import { UploadIcon } from 'icons';

const FileUploadInner: FC<{
  mode: 'file' | 'directory';
  filesOrEntries: FilesOrEntries;
  onClose(value: FormValue): void;
}> = ({ mode, filesOrEntries, onClose }) => {
  const {
    state,
    nodes,
    isLack,
    dirCount,
    fileCount,
    stats,
    buildFormValue,
    handlers,
  } = useFileUploadLogic({ mode, filesOrEntries });
  const i18n = useLingui();
  const onConfirm = useCallback(() => {
    onClose(buildFormValue());
  }, [buildFormValue, onClose]);
  return (
    <main className="overflow-auto px-1">
      <FileUploadImpl
        mode={mode}
        isLack={isLack}
        dirCount={dirCount}
        fileCount={fileCount}
        nodes={nodes}
        stats={stats}
        onCaptionChange={handlers.changeCaption}
        onTagsChange={handlers.changeTags}
        caption={state.caption}
        tags={state.tags}
      />
      <Button
        className="rounded-lg px-3 py-2"
        disabled={isLack}
        onClick={onConfirm}
      >
        <UploadIcon className="mr-1 h-4 w-4" />
        <span>{i18n._('Upload')}</span>
      </Button>
    </main>
  );
};

export default function FileUploadPage() {
  const [state, setState] = useState<{
    mode: 'file' | 'directory';
    filesOrEntries: FilesOrEntries;
  }>();
  const i18n = useLingui();
  const metadataRef = useRef({ isTimeout: false, isConfirm: false });
  const navigate = useNavigate();
  const location = useLocation();
  const gotoHome = useCallback(
    (replace?: boolean) => {
      if (history.length > 0 && !replace) {
        navigate(-1);
      } else {
        navigate('/', { replace: true });
      }
    },
    [navigate],
  );
  const onConfirm = useCallback(
    (value: FormValue) => {
      metadataRef.current.isConfirm = true;
      FileUploadPage.signal.emit('exit', value);
      gotoHome();
    },
    [gotoHome],
  );
  useLayoutEffect(() => {
    FileUploadPage.signal.emit('ready');
    let entered = false;
    let timer: number | undefined = window.setTimeout(() => {
      if (entered) return void 0;
      timer = undefined;
      console.log('recv data timeout', entered);
      metadataRef.current.isTimeout = true;
      gotoHome(true);
    }, 160);
    const signal = FileUploadPage.signal;
    return signal.batch(
      signal.on('enter', ({ mode, filesOrEntries }) => {
        entered = true;
        console.log('AA, enter', entered);
        window.clearTimeout(timer);
        timer = undefined;
        setState({ mode, filesOrEntries });
      }),
      () => {
        if (timer) window.clearTimeout(timer);
      },
    );
  }, [gotoHome]);
  useEffect(() => {
    const pathname = location.pathname;
    const metadata = metadataRef.current;
    return () => {
      if (
        window.location.pathname !== pathname &&
        !metadata.isConfirm &&
        !metadata.isTimeout
      ) {
        FileUploadPage.signal.emit('exit', undefined);
      }
    };
  }, [location.pathname]);
  return (
    <AnimationPage className="flex flex-col">
      <header className="p-4">
        <h2 className="font-bold">
          {state?.mode == 'directory'
            ? i18n._('Upload folder')
            : i18n._('Upload files')}
        </h2>
      </header>
      <main className="relative flex-1 p-4">
        {state && (
          <FileUploadInner
            mode={state.mode}
            filesOrEntries={state.filesOrEntries}
            onClose={onConfirm}
          />
        )}
      </main>
    </AnimationPage>
  );
}

FileUploadPage.signal = new EventBus<{
  enter: {
    mode: 'file' | 'directory';
    filesOrEntries: FilesOrEntries;
  };
  exit:
    | {
        entries: FilesOrEntries;
        tags: string[];
        caption: string;
      }
    | undefined;
  ready: undefined;
}>();
