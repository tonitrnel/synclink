import { ReactComponent as LogoIcon } from '~/assets/logo.svg';
import { List } from '~/components/list';
import { useMediaQuery } from '~/utils/hooks/use-media-query.ts';
import {
  P2PFileReceiverProvider,
  P2PFileTransferProvider,
} from '~/components/file-transfer-dialog';
import { ViewerProvider } from '~/components/viewer-dialog';
import { useCallback, useLayoutEffect, useState } from 'react';
import { Sidebar } from './sidebar';
import { clsx } from '~/utils/clsx';
import { DesktopInput } from '~/components/input';
import { Loading } from '~/components/loading';
import { useLingui } from '@lingui/react';
import { withProduce } from '~/utils/with-produce.ts';
import { getScrollBarWidth } from '~/utils/get-scrollbar-width.ts';

export default function DesktopHomePage() {
  const [state, setState] = useState(() => ({
    ready: false,
  }));
  const isDesktop = useMediaQuery(useMediaQuery.DESKTOP_QUERY);
  const i18n = useLingui();
  const onReady = useCallback(() => {
    withProduce(setState, (draft) => {
      draft.ready = true;
    });
  }, []);
  useLayoutEffect(() => {
    getScrollBarWidth();
  }, []);
  return (
    <>
      {isDesktop && <Sidebar />}
      <section className="relative my-0 box-border flex h-full flex-[2] flex-col">
        {!isDesktop && (
          <header className="relative z-10 flex items-center justify-center gap-2 border-b border-b-gray-200 shadow">
            <LogoIcon className="h-12 w-12" />
            <h1 className="pt-2 font-bold">Cedasync</h1>
          </header>
        )}
        <main className="relative flex-1">
          {!state.ready && (
            <Loading.Wrapper className="bg-background">
              <Loading>
                <span className="capitalize">{i18n._('Receiving')}</span>
                <span className="ani_dot">...</span>
              </Loading>
            </Loading.Wrapper>
          )}
          <List
            onReady={onReady}
            className="scroller desktop:px-30 absolute bottom-0 left-0 right-0 top-0 box-border h-full w-full overflow-y-scroll px-4 pad:px-20"
          />
        </main>
        <footer
          className={clsx(
            'z-10 mx-auto mt-2 box-border w-full py-2',
            isDesktop ? 'py-4 pl-20 pt-2' : 'shadow-footer px-2',
            isDesktop && 'pr-[calc(5rem+var(--scrollbar-width,0px))]',
          )}
        >
          <DesktopInput />
        </footer>
      </section>
      <ViewerProvider isMobile={false} />
      <P2PFileTransferProvider isMobile={false} />
      <P2PFileReceiverProvider />
    </>
  );
}
