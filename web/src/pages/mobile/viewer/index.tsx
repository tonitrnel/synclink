import { AnimationPage } from '~/components/animation-page';
import { FC, Suspense, useCallback, useState } from 'react';
import { withProduce } from '~/utils/with-produce.ts';
import { useSrc, useViewerLoader } from '~/components/viewer-dialog/hooks.ts';
import { useLocation, Location, Navigate } from 'react-router-dom';
import { ViewerOptions } from '~/components/viewer-dialog';
import { Loading } from '~/components/loading';

const ViewerImpl: FC<ViewerOptions> = ({
  resourceId,
  subResourceId,
  filename,
  mimetype,
  extname,
}) => {
  const [state, setState] = useState({ ready: false });
  const onReady = useCallback(() => {
    withProduce(setState, (draft) => {
      draft.ready = true;
    });
  }, []);
  const onError = useCallback((error: unknown) => {
    console.log(error);
  }, []);
  const Viewer = useViewerLoader({ extname, filename, mimetype });
  const src = useSrc(resourceId, subResourceId);
  return (
    <AnimationPage>
      <main className="relative flex h-full flex-col gap-2 bg-gray-100 p-4">
        <h2 className="font-bold">{filename}</h2>
        <div className="relative flex-1 overflow-y-auto rounded-lg bg-background">
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
        </div>
      </main>
    </AnimationPage>
  );
};

export default function ViewerPage() {
  const location = useLocation() as Location<ViewerOptions>;
  if (!location) return <Navigate to="/" replace />;
  return <ViewerImpl {...location.state} />;
}
