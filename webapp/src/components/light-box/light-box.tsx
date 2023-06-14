import { FC, memo, useCallback, useEffect, useRef, useState } from 'react';
import { Spin } from '~/components/spin';
import './light-box.css';

const clamp = (min: number, val: number, max: number) =>
  Math.max(min, Math.min(max, val));
export const LightBox: FC<{
  src: string;
  alt?: string;
  onClose(): void;
}> = memo(({ src, alt, onClose }) => {
  const [ready, setReady] = useState(false);
  const [error, serError] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const isPrevented = useRef(false);
  const onLoad = useCallback(() => {
    setReady(true);
  }, []);
  const onLoadError = useCallback(() => {
    setReady(true);
    serError(true);
  }, []);
  const handleClose = useCallback(() => {
    if (isPrevented.current) return void 0;
    onClose();
  }, [onClose]);
  useEffect(() => {
    const image = imageRef.current;
    const container = image?.parentElement;
    if (!image || !container) return void 0;
    const onMouseUp = () => {
      image.removeEventListener('mousemove', onMouseMove);
      if (timer) window.clearTimeout(timer);
      if (isPrevented.current) {
        image.style.removeProperty('cursor');
        requestAnimationFrame(() => (isPrevented.current = false));
      }
    };
    const startAxis = {
      x: 0,
      y: 0,
    };
    const startPoint = {
      left: 0,
      top: 0,
    };
    const previousAxis = { ...startAxis };
    const previousArrow = {
      left: true,
      top: true,
    };
    const scale = 1;
    let timer: number | void = void 0;
    const onMouseMove = (evt: MouseEvent) => {
      window.requestAnimationFrame(() => {
        if (!isPrevented.current) {
          if (timer) window.clearTimeout(timer);
          timer = void 0;
          isPrevented.current = true;
          image.style.setProperty('cursor', 'grabbing');
        }
        const axis = {
          x: evt.x,
          y: evt.y,
        };
        const reverse = {
          left: previousArrow.left
            ? axis.x - previousAxis.x < 0
            : axis.x - previousAxis.x > 0,
          top: previousArrow.top
            ? axis.y - previousAxis.y < 0
            : axis.y - previousAxis.y > 0,
        };
        const offset = {
          // reverse
          x: -(axis.x - startAxis.x) * scale,
          y: -(axis.y - startAxis.y) * scale,
        };
        const scroll = {
          left: clamp(
            0,
            Math.round(startPoint.left + offset.x),
            container.scrollWidth
          ),
          top: clamp(
            0,
            Math.round(startPoint.top + offset.y),
            container.scrollHeight
          ),
        };
        // Mouse direction reverse. reset.
        if (reverse.left) {
          if (
            container.scrollWidth -
              (container.scrollLeft + container.clientWidth) <=
              1 ||
            container.scrollLeft === 0
          ) {
            startAxis.x = axis.x;
            startPoint.left = container.scrollLeft;
          }
        }
        if (reverse.top) {
          // The inner element of container height may exist float 0.5，but container.scrollTop returns int number or container.scrollTo only receives unsigned int number.
          // By this time, `container.scrollTop  + container.clientHeight` should be less `container.scrollHeight` by one pixel.
          if (
            container.scrollHeight -
              (container.scrollTop + container.clientHeight) <=
              1 ||
            container.scrollTop === 0
          ) {
            startAxis.y = axis.y;
            startPoint.top = container.scrollTop;
          }
        }

        container.scrollTo(scroll);
        Object.assign(previousAxis, axis);
        if (reverse.left) previousArrow.left = !previousArrow.left;
        if (reverse.top) previousArrow.top = !previousArrow.top;
      });
    };
    const onMouseDown = (evt: MouseEvent) => {
      evt.preventDefault();
      evt.stopPropagation();
      if (evt.button !== 0) return void 0;
      isPrevented.current = false;
      if (
        container.clientWidth < container.scrollWidth ||
        container.clientHeight < container.scrollHeight
      ) {
        startAxis.x = evt.x;
        startAxis.y = evt.y;
        startPoint.left = container.scrollLeft;
        startPoint.top = container.scrollTop;
        image.addEventListener('mousemove', onMouseMove);
      }
      timer = window.setTimeout(() => {
        isPrevented.current = true;
        timer = void 0;
        image.style.setProperty('cursor', 'grabbing');
      }, 300);
      window.addEventListener('mouseup', onMouseUp);
    };
    image.addEventListener('mousedown', onMouseDown);
    return () => {
      image.removeEventListener('mousedown', onMouseDown);
      image.removeEventListener('mousemove', onMouseMove);
      isPrevented.current = false;
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);
  return (
    <div className="light-box" onClick={handleClose}>
      <div
        className="light-box-wrap"
        data-status={!ready ? 'loading' : error ? 'error' : void 0}
      >
        {!ready && (
          <div className="light-box-loading">
            <Spin />
          </div>
        )}
        {error && (
          <div className="light-box-error">
            <p>图片加载失败</p>
            <a href={src} target="_blank">
              单击访问
            </a>
          </div>
        )}
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          onLoad={onLoad}
          onError={onLoadError}
          className="light-box-img"
        />
      </div>
    </div>
  );
});
