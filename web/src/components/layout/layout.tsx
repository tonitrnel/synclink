import { FC, ReactNode } from 'react';
import { Sidebar, type SidebarProps } from './sidebar.tsx';
import { TitleBar, type TitleBarProps } from './title-bar.tsx';

export const Layout: FC<{
  sidebarProps?: SidebarProps;
  titleBarProps: TitleBarProps;
  children: ReactNode;
}> = ({ sidebarProps, titleBarProps, children }) => {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-gray-50 text-gray-800">
      <Sidebar {...sidebarProps} />
      <main className="flex flex-1 flex-col overflow-hidden">
        <TitleBar {...titleBarProps} />
        <div className="flex flex-1 overflow-hidden">{children}</div>
      </main>
    </div>
  );
};
