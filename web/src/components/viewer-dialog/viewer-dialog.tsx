import { Dialog } from 'primereact/dialog';
import { FC, Suspense, useCallback, useMemo, useState } from 'react';
import { loadViewerComponent } from './viewers';
import { withProduce } from '~/utils/with-produce';
import { Loading } from '../loading';
import { ViewerOptions } from './event';

export const ViewerDialog: FC<
  {
    visible: boolean;
    onClose(): void;
  } & ViewerOptions
> = ({ resourceId, subResourceId, filename, mimetype, visible, onClose, extname }) => {
  const [state, setState] = useState({ ready: false });
  const onReady = useCallback(() => {
    withProduce(setState, (draft) => {
      draft.ready = true;
    });
  }, []);
  const onError = useCallback((error: unknown) => {
    console.log(error);
  }, []);
  const Viewer = useMemo(() => {
    const ext = extname||filename.split('.').pop() || '';
    return loadViewerComponent(mimetype, ext);
  }, [extname, filename, mimetype]);
  const src = useMemo(() => {
    if (subResourceId) {
      return `${__ENDPOINT__}/api/directory/${resourceId}/${subResourceId}`;
    } else {
      return `${__ENDPOINT__}/api/file/${resourceId}`;
    }
  }, [resourceId, subResourceId]);
  return (
    <Dialog
      header={<h3 className="max-w-[240px]  truncate ">{filename}</h3>}
      visible={visible}
      maximizable
      onHide={onClose}
      className="w-[560px]"
      contentClassName="p-0"
      draggable={false}
      headerClassName="[&>.p-dialog-title]:font-normal [&>.p-dialog-title]:text-base p-3 bg-gray-100"
    >
      <section className="min-h-[240px] relative h-full">
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
    </Dialog>
  );
};
