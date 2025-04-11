import { FC, Suspense, useCallback, useState } from 'react';
import { withProduce } from '~/utils/with-produce';
import { Loading } from '../loading';
import { ViewerOptions } from './event';
import { Dialog } from '../ui/dialog';
import { useLingui } from '@lingui/react';
import { MaximizeIcon, MinimizeIcon } from 'icons';
import { clsx } from '~/utils/clsx';
import { useSrc, useViewerLoader } from './hooks.ts';
import { t } from '@lingui/macro';

export const ViewerDialog: FC<
  {
    visible: boolean;
    onClose(): void;
  } & ViewerOptions
> = ({
  resourceId,
  subResourceId,
  filename,
  mimetype,
  visible,
  onClose,
  extname,
}) => {
  const [state, setState] = useState({ ready: false });
  const [fullscreen, setFullscreen] = useState(false);
  const i18n = useLingui();
  const onReady = useCallback(() => {
    withProduce(setState, (draft) => {
      draft.ready = true;
    });
  }, []);
  const onError = useCallback((error: unknown) => {
    console.log(error);
  }, []);
  const toggleFullscreen = useCallback(() => {
    setFullscreen((fullscreen) => !fullscreen);
  }, []);
  const Viewer = useViewerLoader({ extname, filename, mimetype });
  const src = useSrc(resourceId, subResourceId);
  return (
    <Dialog
      visible={visible}
      fullscreen={fullscreen}
      onClose={onClose}
      className="~border ~bg-background ~shadow"
    >
      <Dialog.Header className="~border-b text-white">
        <Dialog.Title
          className="~text-lg max-w-full truncate text-sm"
          title={filename}
        >
          {filename}
        </Dialog.Title>
        <Dialog.Description className="sr-only">
          {t(i18n.i18n)`View the contents of file "${filename}"`}
        </Dialog.Description>
        <button
          className="rounded-sm p-0.5 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&>svg]:stroke-[3px]"
          onClick={toggleFullscreen}
        >
          {fullscreen ? (
            <MinimizeIcon className="h-4 w-4 p-0.5" />
          ) : (
            <MaximizeIcon className="h-4 w-4 p-0.5" />
          )}
          <span className="sr-only">
            {fullscreen
              ? i18n._('Exit fullscreen')
              : i18n._('Enter fullscreen')}
          </span>
        </button>
      </Dialog.Header>
      <Dialog.Content className="~p min-h-0 overflow-hidden rounded">
        <section
          className={clsx(
            'mini-scrollbar relative overflow-y-auto',
            fullscreen ? 'h-full max-h-full w-full' : 'max-h-[80vh] w-[48rem]',
          )}
        >
          {!state.ready && (
            <Loading.Wrapper>
              <Loading />
            </Loading.Wrapper>
          )}
          <Suspense>
            <Viewer
              resourceId={resourceId}
              src={src}
              filename={filename}
              mimetype={mimetype}
              onReady={onReady}
              onError={onError}
            />
          </Suspense>
        </section>
      </Dialog.Content>
    </Dialog>
  );
};
