import { FC, ReactNode } from 'react';
import { Sidebar, type SidebarProps } from './sidebar.tsx';
import { TitleBar, type TitleBarProps } from './title-bar.tsx';
import { useMediaQuery } from '~/utils/hooks/use-media-query.ts';

export const Layout: FC<{
    sidebarProps?: SidebarProps;
    titleBarProps: TitleBarProps['externalProps'];
    children: ReactNode;
}> = ({ sidebarProps, titleBarProps, children }) => {
    const isDesktop = useMediaQuery(useMediaQuery.DESKTOP_QUERY);
    return (
        <div
            className="flex h-screen w-full overflow-hidden text-gray-800"
            style={{
                background: `#dee2e5 url(/sidebar_bg2.png)`,
                backgroundPosition: 'right',
                backgroundSize: 'cover',
            }}
        >
            {isDesktop && <Sidebar {...sidebarProps} />}
            <main className="flex flex-1 flex-col overflow-hidden">
                <TitleBar externalProps={titleBarProps} showMenu={!isDesktop} />
                <div className="flex flex-1 overflow-hidden">{children}</div>
            </main>
        </div>
    );
};
