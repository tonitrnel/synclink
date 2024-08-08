import { RefObject, useEffect } from 'react';
import { clsx } from '~/utils/clsx.ts';

// Register "measure-size" event
export const useMeasureSize = (ref: RefObject<HTMLTextAreaElement>) => {
  useEffect(() => {
    const textarea = ref.current;
    const container = textarea?.parentElement;
    if (!textarea || !container) return void 0;
    let measureTimer: number | void = void 0;
    const measure = document.createElement('div');
    measure.className = textarea.className;
    let initialized = false;
    let unmounted = false;
    let previousHeight = 0;
    const initialize = () => {
      if (unmounted) return void 0;
      measure.className = clsx(
        textarea.className,
        'absolute overflow-y-auto whitespace-pre-wrap -z-50 left-0 top-0 pointer-events-none invisible',
      );
      const computedStyle = window.getComputedStyle(textarea);
      if (!computedStyle.width.trim()) return void 0;
      measure.style.setProperty('width', computedStyle.width);
      measure.style.setProperty('height', computedStyle.height);
      container.appendChild(measure);
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
        measure.innerText = value.endsWith('\n') ? value + ' ' : value || ' ';
        const measureHeight = measure.scrollHeight;
        const height = Math.min(measureHeight, 300);
        if (
          measureHeight > 300 &&
          textarea.selectionStart === value.length &&
          textarea.scrollHeight > textarea.clientHeight
        ) {
          textarea.scrollTo({ top: textarea.scrollHeight });
        }
        if (previousHeight === height) {
          return void 0;
        }
        previousHeight = height;
        textarea.style.setProperty('height', `${height}px`);
      });
    };
    textarea.addEventListener('measure-size', measureSize);
    window.requestAnimationFrame(initialize);
    return () => {
      unmounted = true;
      if (initialized) container.removeChild(measure);
      textarea.removeEventListener('measure-size', measureSize);
      if (measureTimer) window.cancelAnimationFrame(measureTimer);
      measureTimer = void 0;
    };
  }, [ref]);
};

// Dispatch the "measure-size" event
export const dispatchMeasureSizeEvent = (textarea: HTMLTextAreaElement) => {
  textarea.dispatchEvent(new CustomEvent('measure-size'));
};
