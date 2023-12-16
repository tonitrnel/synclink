import { FC } from 'react';
import { ReactComponent as LogoIcon } from '~/assets/logo.svg';
import { Input } from '~/components/input';
import { List } from '~/components/list';
import { useMediaQuery } from '~/utils/hooks/use-media-query.ts';
import { Sidebar } from '~/components/sidebar';

export const Layout: FC = () => {
  const isDesktop = useMediaQuery('(min-width: 1280px)');
  return (
    <>
      {isDesktop && <Sidebar />}
      <section className="flex-[2] relative flex flex-col pad:py-4 box-border h-full my-0 overflow-hidden bg-gray-100">
        {!isDesktop && (
          <header className="relative z-10 flex items-center gap-2 p-4 border-b border-b-gray-200 shadow">
            <LogoIcon className="w-8 h-8" />
            <h1 className="ml-2 text-xl">SyncLink</h1>
          </header>
        )}
        <main className="flex-1 h-full overflow-hidden">
          <List className="relative flex-1 h-full box-border px-4 pr-3 pad:px-40 overflow-y-auto" />
        </main>
        <footer className="py-4 pad:pt-2 mx-auto w-full mt-2 z-10 bg-white pad:bg-gray-100 box-border px-6 pad:px-40  shadow-revert-md">
          <Input />
        </footer>
      </section>
    </>
  );
};
