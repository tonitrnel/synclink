import { FC, memo, useEffect, useRef, useState } from 'react';
import { ReactComponent as LogoIcon } from '~/assets/logo.svg';
import { AudioGlobalController } from '~/components/audio-player';
import { Stats } from '~/components/stats';

export const Sidebar: FC = memo(() => {
  const containerRef = useRef<HTMLElement>(null);
  const [imgUrl, setImgUrl] = useState<string | undefined>(
    () => sessionStorage.getItem('__decorative_img_url')?.trim() || void 0
  );
  useEffect(() => {
    const element = containerRef.current;
    if (!element || imgUrl) return void 0;
    const rect = element.getBoundingClientRect();
    const url = `https://source.unsplash.com/${Math.floor(
      rect.width
    )}x${Math.floor(rect.height)}/daily?flower,twilight`;
    sessionStorage.setItem('__decorative_img_url', url);
    setImgUrl(url);
  }, [imgUrl]);
  return (
    <section
      ref={containerRef}
      className="relative flex-1 flex h-full items-center justify-center bg-cover bg-center"
      style={{
        backgroundImage: imgUrl ? `url("${imgUrl}")` : void 0,
      }}
    >
      <header className="absolute left-12 top-12 flex items-center gap-2">
        <LogoIcon className="w-12 h-12" />
        <h1 className="ml-2 text-3xl">
          <span>Sync</span>
          <span className="text-white">Link</span>
        </h1>
      </header>
      <div className="absolute bottom-8 right-6 flex gap-2 items-center h-8">
        <AudioGlobalController />
        <Stats className="text-white text-sm items-center flex gap-2 capitalize italic" />
      </div>
    </section>
  );
});
