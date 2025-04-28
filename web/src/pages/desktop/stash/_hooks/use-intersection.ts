import { RefObject, useLayoutEffect, useState } from 'react';
import { lookupHTMLNode } from '~/utils/lookup-html-node.ts';

let obs: IntersectionObserver | null = null;
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

export const useIntersection = (targetRef: RefObject<HTMLElement>): boolean => {
    const [visible, setVisible] = useState(false);
    useLayoutEffect(() => {
        const target = targetRef.current;
        if (!target) return void 0;
        if (!obs) {
            obs = new IntersectionObserver(onIntersection, {
                root: lookupHTMLNode(target, '.scroller'),
                rootMargin: '0px',
                threshold: 0.1,
            });
        }
        // let startTime = Date.now();
        const release = () => {
            listeners.delete(target);
            obs?.unobserve(target);
        };
        const onIntersecting = (entry: IntersectionObserverEntry) => {
            // const nowTime = Date.now();
            // console.log(
            //   `onIntersecting, ${nowTime - startTime}ms`,
            //   entry.isIntersecting,
            //   entry.intersectionRatio,
            //   entry.target,
            // );
            // startTime = nowTime;
            if (entry.isIntersecting) {
                setVisible(true);
            } else {
                setVisible(false);
            }
        };
        listeners.set(target, onIntersecting);
        obs.observe(target);
        return release;
    }, [targetRef]);
    return visible;
};
