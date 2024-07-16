export const getScrollBarWidth = () => {
  const outer = document.createElement('div');
  outer.style.visibility = 'hidden';
  outer.style.position = 'fixed';
  outer.style.zIndex = '-100';
  outer.style.overflow = 'scroll';
  const inner = document.createElement('div');
  outer.appendChild(inner);
  document.body.appendChild(outer);
  const scrollbarWidth = outer.offsetWidth - inner.offsetWidth;
  outer.parentNode?.removeChild(outer);
  return scrollbarWidth;
};
export const SCROLLBAR_WIDTH = getScrollBarWidth();
