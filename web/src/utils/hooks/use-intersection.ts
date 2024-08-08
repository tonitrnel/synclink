import { RefObject, useLayoutEffect, useState } from 'react';

let obs: IntersectionObserver;
const listeners = new WeakMap<
  HTMLElement,
  (entry: IntersectionObserverEntry) => void
>();
const onIntersection: IntersectionObserverCallback = (entries) => {
  entries.forEach((entry) => {
    const listener = listeners.get(entry.target as HTMLElement);
    if (!listener) return void 0;
    listener(entry);
  });
};

export const useIntersection = (
  targetRef: RefObject<HTMLElement>,
  once = true,
): boolean => {
  const [visible, setVisible] = useState(false);
  useLayoutEffect(() => {
    const target = targetRef.current;
    if (!target) return void 0;
    if (!obs) {
      obs = new IntersectionObserver(onIntersection, {
        root: document.body,
        rootMargin: '0px',
        threshold: 0.1,
      });
    }
    // const startTime = Date.now();
    const release = () => {
      listeners.delete(target);
      obs.unobserve(target);
    };
    const onIntersecting = (entry: IntersectionObserverEntry) => {
      // console.log(
      //   `onIntersecting, ${Date.now() - startTime}ms`,
      //   entry.isIntersecting,
      //   entry.intersectionRatio,
      //   entry.target,
      // );
      if (entry.isIntersecting) {
        setVisible(true);
        if (once) release();
      } else {
        setVisible(false);
      }
    };
    listeners.set(target, onIntersecting);
    obs.observe(target);
    return release;
  }, [targetRef, once]);
  return visible;
};
