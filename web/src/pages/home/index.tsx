import { ReactComponent as LogoIcon } from '~/assets/logo.svg';
import { Input } from '~/components/input';
import { List } from '~/components/list';
import { useMediaQuery } from '~/utils/hooks/use-media-query.ts';
import { SCROLLBAR_WIDTH } from '~/utils/get-scrollbar-width.ts';
import { P2PFileReceiver } from '~/components/file-transfer-dialog';
import { ViewerProvider } from '~/components/viewer-dialog';
import { Sidebar } from './sidebar';

export default function HomePage() {
  const isDesktop = useMediaQuery(useMediaQuery.DESKTOP_QUERY);
  return (
    <>
      {isDesktop && <Sidebar />}
      <section className="flex-[2] relative flex flex-col box-border h-full my-0 overflow-hidden">
        {!isDesktop && (
          <header className="relative z-10 flex items-center gap-2 p-4 border-b border-b-gray-200 shadow">
            <LogoIcon className="w-8 h-8" />
            <h1 className="ml-2 text-xl">Cedasync</h1>
          </header>
        )}
        <main className="flex-1 h-full overflow-hidden">
          <List className="relative flex-1 h-full box-border px-4 pad:px-40 overflow-y-auto" />
        </main>
        <footer
          className="py-2 pad:py-4 pad:pt-2 mx-auto w-full mt-2 z-10 box-border px-4 pad:px-40 shadow-revert-md"
          style={{
            paddingRight:
              isDesktop && SCROLLBAR_WIDTH > 0
                ? `calc(10rem + ${SCROLLBAR_WIDTH / 2}px)`
                : undefined,
          }}
        >
          <Input />
        </footer>
      </section>
      <ViewerProvider />
      <P2PFileReceiver />
    </>
  );
}
