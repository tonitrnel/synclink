import { FC } from 'react';
import { MenuIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';

export interface TitleBarProps {
    externalProps: {
        title: string;
    };
    showMenu?: boolean;

    onClickMenu?(): void;
}

export const TitleBar: FC<TitleBarProps> = ({
    externalProps: { title },
    showMenu,
    onClickMenu,
}) => {
    return (
        <header className="flex h-[50px] items-center gap-2 border-b bg-white/80 px-6 py-3">
            {showMenu && (
                <Button variant="ghost" size="icon" onClick={onClickMenu}>
                    <MenuIcon className="size-5" />
                </Button>
            )}
            <h2 className="text-lg leading-none font-medium capitalize">
                {title}
            </h2>
        </header>
    );
};
