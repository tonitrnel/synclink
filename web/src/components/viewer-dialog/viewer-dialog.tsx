import { FC, Suspense, useCallback, useState } from 'react';
import { withProduce } from '~/utils/with-produce';
import { Loading } from '../loading';
import { ViewerOptions } from './event';
import { Dialog } from '../ui/dialog';
import { useLingui } from '@lingui/react';
import { MaximizeIcon, MinimizeIcon } from 'icons';
import { clsx } from '~/utils/clsx';
import { useSrc, useViewerLoader } from './hooks.ts';

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
    <Dialog visible={visible} fullscreen={fullscreen} onClose={onClose}>
      <Dialog.Header className="-mt-2">
        <Dialog.Title className="max-w-[240px] truncate capitalize">
          {filename}
        </Dialog.Title>
        <Dialog.Description className="sr-only">
          {i18n._(`View the contents of file "${filename}"`)}
        </Dialog.Description>
        <button
          className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
          onClick={toggleFullscreen}
        >
          {fullscreen ? (
            <MinimizeIcon className="h-5 w-5 p-0.5" />
          ) : (
            <MaximizeIcon className="h-5 w-5 p-0.5" />
          )}
          <span className="sr-only">
            {fullscreen
              ? i18n._('Exit fullscreen')
              : i18n._('Enter fullscreen')}
          </span>
        </button>
      </Dialog.Header>
      <Dialog.Content
        className={clsx(
          'overflow-y-auto p-0',
          fullscreen ? 'w-full' : 'w-[560px]',
        )}
      >
        <section className="relative h-full min-h-[18rem]">
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
