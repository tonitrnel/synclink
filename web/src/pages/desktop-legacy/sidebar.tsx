import { FC, memo, useEffect, useRef, useState } from 'react';
import { ReactComponent as LogoIcon } from '~/assets/logo.svg';
import { AudioGlobalController } from '~/components/audio-player';
import { Stats } from '~/components/stats';

export const Sidebar: FC = memo(() => {
  const containerRef = useRef<HTMLElement>(null);
  const [imgUrl, setImgUrl] = useState<string | undefined>(
    () => localStorage.getItem('__decorative_img_url')?.trim() || void 0,
  );
  useEffect(() => {
    const element = containerRef.current;
    if (!element || imgUrl) return void 0;
    const url = `${window.location.href}/bg.jpg`;
    localStorage.setItem('__decorative_img_url', url);
    setImgUrl(url);
  }, [imgUrl]);
  return (
    <aside
      ref={containerRef}
      className="relative flex-1 flex h-full items-center justify-center"
    >
      <div className="absolute w-full h-full -z-10">
        {imgUrl && (
          <img
            src={imgUrl}
            alt=""
            className="w-full h-full object-cover object-center aside-bg"
          />
        )}
        <div className="absolute w-full h-full left-0 top-0 aside-overlay" />
      </div>
      <header className="absolute left-12 top-12">
        <LogoIcon className="w-20 h-20 rounded-md text-white" />
        <h1 className="text-2xl text-white -mt-3">
          <span>Ephemera</span>
        </h1>
      </header>
      <div className="absolute bottom-0 flex gap-2 items-center w-full h-20 justify-end px-8 aside-footer">
        <AudioGlobalController />
        <Stats className="text-white text-sm items-center flex gap-2 capitalize italic" />
      </div>
    </aside>
  );
});
