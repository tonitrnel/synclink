import { RefObject, useEffect } from 'react';
import { clsx } from '~/utils/clsx.ts';

// Register "measure-size" event
export const useMeasureSize = (
    ref: RefObject<HTMLTextAreaElement>,
    scrollerRef?: RefObject<HTMLElement>,
) => {
    useEffect(() => {
        const textarea = ref.current;
        const parent = textarea?.parentElement;
        const scroller = scrollerRef?.current || undefined;
        if (!textarea || !parent) return void 0;
        let measureTimer: number | void = void 0;
        const measure = document.createElement('div');
        const obs = new ResizeObserver(([entry]) => {
            const width = entry.contentRect.width;
            window.requestAnimationFrame(() => {
                measure.style.setProperty('width', `${width}px`);
            });
        });
        measure.className = textarea.className;
        let initialized = false;
        let unmounted = false;
        let previousHeight = 0;
        const initialize = () => {
            if (unmounted) return void 0;
            measure.id = 'textarea-measurer';
            measure.className = clsx(
                textarea.className,
                'absolute overflow-y-auto whitespace-pre-wrap -z-50 left-0 top-0 pointer-events-none invisible',
            );
            const computedStyle = window.getComputedStyle(textarea);
            if (!computedStyle.width.trim()) return void 0;
            measure.style.setProperty('width', computedStyle.width);
            measure.style.setProperty('height', computedStyle.height);
            parent.appendChild(measure);
            obs.observe(textarea);
            initialized = true;
        };
        const measureSize = () => {
            if (!initialized) {
                window.requestAnimationFrame(initialize);
                return void 0;
            }
            if (measureTimer) window.cancelAnimationFrame(measureTimer);
            measureTimer = window.requestAnimationFrame(() => {
                const value = textarea.value;
                measure.innerText = value.endsWith('\n')
                    ? value + ' '
                    : value || ' ';
                const measureHeight = measure.scrollHeight;
                const height = Math.min(measureHeight, 300);
                const target = scroller || textarea;
                // 输入时自动滚动到最下面
                if (
                    measureHeight > 300 &&
                    textarea.selectionStart === value.length &&
                    target.scrollHeight > target.clientHeight
                ) {
                    target.scrollTo({ top: target.scrollHeight });
                }
                if (target === scroller) {
                    textarea.style.setProperty('height', `${measureHeight}px`);
                }
                if (previousHeight === height) {
                    return void 0;
                }
                // target.animate([{
                //     height: `${previousHeight == 0 ? height : previousHeight}px`
                // }, {
                //     height: `${height}px`
                // }], {
                //     duration: 160,
                //     iterations: 1,
                //     fill: 'forwards'
                // });
                previousHeight = height;
                target.style.setProperty('height', `${height}px`);
            });
        };
        textarea.addEventListener('measure-size', measureSize);
        window.requestAnimationFrame(initialize);
        return () => {
            unmounted = true;
            if (initialized) parent.removeChild(measure);
            textarea.removeEventListener('measure-size', measureSize);
            if (measureTimer) window.cancelAnimationFrame(measureTimer);
            measureTimer = void 0;
            obs.disconnect();
        };
    }, [ref, scrollerRef]);
};

// Dispatch the "measure-size" event
export const dispatchMeasureSizeEvent = (textarea: HTMLTextAreaElement) => {
    textarea.dispatchEvent(new CustomEvent('measure-size'));
};
