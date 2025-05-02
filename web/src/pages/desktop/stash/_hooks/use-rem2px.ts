import { useCallback, useLayoutEffect, useRef } from 'react';

export const useRem2px = () => {
    const rootSizeRef = useRef<number>(16);
    useLayoutEffect(() => {
        const media = window.matchMedia('(max-width: 1920px)');
        rootSizeRef.current = parseFloat(
            window.getComputedStyle(document.body).fontSize,
        );
        const mediaChange = (_e: MediaQueryListEvent) => {
            rootSizeRef.current = parseFloat(
                window.getComputedStyle(document.body).fontSize,
            );
        };
        media.addEventListener('change', mediaChange);
        return () => {
            media.removeEventListener('change', mediaChange);
        };
    }, []);
    return useCallback((rem: number): number => {
        return rootSizeRef.current * rem;
    }, []);
};
