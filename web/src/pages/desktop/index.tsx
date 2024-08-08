import { ReactComponent as LogoIcon } from '~/assets/logo.svg';
import { List } from '~/components/list';
import { useMediaQuery } from '~/utils/hooks/use-media-query.ts';
import { SCROLLBAR_WIDTH } from '~/utils/get-scrollbar-width.ts';
import { P2PFileReceiver } from '~/components/file-transfer-dialog';
import { ViewerProvider } from '~/components/viewer-dialog';
import { useCallback, useState } from 'react';
import { Sidebar } from './sidebar';
import { clsx } from '~/utils/clsx';
import { DesktopInput } from '~/components/input';
import { Loading } from '~/components/loading';
import { t } from '@lingui/macro';

export default function DesktopHomePage() {
  const isDesktop = useMediaQuery(useMediaQuery.DESKTOP_QUERY);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => {
    setReady(true);
  }, []);
  return (
    <>
      {isDesktop && <Sidebar />}
      <section className="flex-[2] relative flex flex-col box-border h-full my-0">
        {!isDesktop && (
          <header className="relative z-10 flex items-center justify-center gap-2 border-b border-b-gray-200 shadow">
            <LogoIcon className="w-12 h-12" />
            <h1 className="font-bold pt-2">Cedasync</h1>
          </header>
        )}
        <main className="relative flex-1">
          {!ready && (
            <Loading.Wrapper className="bg-background">
              <Loading>
                <span className="capitalize">{t`receiving`}</span>
                <span className="ani_dot">...</span>
              </Loading>
            </Loading.Wrapper>
          )}
          <List
            onReady={onReady}
            className="absolute left-0 top-0 bottom-0 right-0 w-full h-full box-border px-4 pad:px-20 desktop:px-30 overflow-y-scroll"
          />
        </main>
        <footer
          className={clsx(
            'py-2 mx-auto w-full mt-2 z-10 box-border',
            isDesktop ? 'py-4 pt-2 pl-20' : 'px-2 shadow-footer',
            isDesktop &&
              SCROLLBAR_WIDTH > 0 &&
              'pr-[calc(5rem+var(--scrollbar-width,10px))]',
          )}
        >
          <DesktopInput />
        </footer>
      </section>
      <ViewerProvider />
      <P2PFileReceiver />
    </>
  );
}
