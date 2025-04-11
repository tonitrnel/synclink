import { FC } from 'react';

export interface TitleBarProps {
  title: string;
}

export const TitleBar: FC<TitleBarProps> = ({ title }) => {
  return (
    <header className="flex items-center justify-between border-b bg-white px-6 py-3 h-[50px]">
      <h2 className="text-lg font-medium capitalize leading-none">{title}</h2>
    </header>
  );
};
