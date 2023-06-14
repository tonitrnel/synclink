import {
  createElement,
  MouseEventHandler,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { LightBox } from './light-box.tsx';

export const useLightBox = (src?: string) => {
  const [deps, setDeps] = useState<{
    el: HTMLElement;
    id: string;
    src: string;
    alt?: string;
  }>();
  const unmount = useCallback(() => {
    setDeps(void 0);
  }, []);
  const install: MouseEventHandler<HTMLElement> = useCallback((evt) => {
    const image = evt.currentTarget.querySelector('img');
    if (!image) return void 0;
    evt.preventDefault();
    const element = document.createElement('section');
    element.id = `portal-root-${Math.random().toString(16).slice(2)}`;
    document.body.append(element);
    setDeps({
      el: element,
      id: image.dataset.id || window.crypto.randomUUID(),
      src: image.src,
      alt: image.alt,
    });
  }, []);
  useEffect(() => {
    if (!deps) return void 0;
    document.documentElement.style.setProperty('overflow', 'hidden');
    const search = new URLSearchParams(location.search);
    search.set('preview', deps.id);
    let isHistoryBack = false;
    const uninstall = () => {
      isHistoryBack = true;
      unmount();
    };
    const url = new URL(location.href);
    url.search = search.toString();
    window.history.pushState(
      {
        src: deps.src,
        alt: deps.alt,
      },
      '',
      url
    );
    window.addEventListener('popstate', uninstall, { once: true });
    return () => {
      if (document.body.contains(deps.el)) document.body.removeChild(deps.el);
      if (!isHistoryBack) history.back();
      document.documentElement.style.removeProperty('overflow');
      window.removeEventListener('popstate', uninstall);
    };
  }, [deps, unmount]);
  return {
    install,
    unmount,
    portal: deps
      ? createPortal(
          createElement(LightBox, {
            src: src || deps.src,
            alt: deps.alt,
            onClose: unmount,
          }),
          deps.el
        )
      : null,
  };
};
