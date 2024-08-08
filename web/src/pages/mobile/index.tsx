import { List } from '~/components/list';
import { ReactComponent as LogoIcon } from '~/assets/logo.svg';
import { MobileInput } from '~/components/input';
import { FC, memo, useCallback, useState } from 'react';
import { Loading } from '~/components/loading';
import { useLingui } from '@lingui/react';
import { Route, useLocation, useNavigate } from 'react-router-dom';
import FileTransferPage from './file-transfer';
import ViewerPage from './viewer';
import { AnimatedRoutes } from '~/components/animated-routes';
import { ChevronLeftIcon } from 'icons';
import { useNavigateOnOpen } from '~/components/viewer-dialog';

const Header: FC = memo(() => {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === '/';
  const i18n = useLingui();
  const gotoHome = useCallback(() => {
    if (history.length > 0) {
      navigate(-1);
    } else {
      navigate('/', { replace: true });
    }
  }, [navigate]);
  return (
    <header className="relative z-20 flex h-[3.428rem] w-full justify-center border-b border-b-gray-200 bg-background p-2 px-4 shadow">
      {!isHome && (
        <button
          className="absolute left-4 flex select-none items-center rounded px-1 py-2 active:bg-gray-200"
          onClick={gotoHome}
        >
          <ChevronLeftIcon className="mr-2 h-5 w-5" />
          <span className="pr-2">{i18n._('Back')}</span>
        </button>
      )}
      <div className="flex h-full items-center gap-2">
        <LogoIcon className="h-14 w-14" />
        {/*<h1 className="pt-1 text-lg font-bold">Cedasync</h1>*/}
      </div>
    </header>
  );
});

export default function MobileHomePage() {
  const [ready, setReady] = useState(false);
  const i18n = useLingui();
  const onReady = useCallback(() => {
    setReady(true);
  }, []);
  useNavigateOnOpen();
  return (
    <section className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
      <div className="relative flex flex-col">
        <Header />
      </div>
      <div className="relative flex min-h-0 min-w-0 flex-auto flex-col items-stretch justify-stretch">
        <main className="relative flex-1">
          {!ready && (
            <Loading.Wrapper className="bg-background">
              <Loading>
                <span className="capitalize">{i18n._('Receiving')}</span>
                <span className="ani_dot">...</span>
              </Loading>
            </Loading.Wrapper>
          )}
          <List
            className="hidden-scrollbar absolute bottom-0 left-0 right-0 top-0 box-border h-full w-full overflow-x-hidden overflow-y-scroll px-4 pad:px-40"
            onReady={onReady}
          />
        </main>
        <footer className="shadow-footer relative z-10 -mt-2 box-border flex w-full flex-shrink-0 items-center bg-background px-4">
          <MobileInput />
        </footer>
        <AnimatedRoutes>
          <Route path="/file-transfer" element={<FileTransferPage />} />
          <Route path="/viewer" element={<ViewerPage />} />
        </AnimatedRoutes>
      </div>
    </section>
  );
}
