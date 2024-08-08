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
  const style =
    document.querySelector<HTMLStyleElement>('#scrollbar-width') ||
    document.createElement('style');
  style.id = 'scrollbar-width';
  style.innerHTML = `:root{
  --scrollbar-width: ${scrollbarWidth}px;
  }`;
  document.head.appendChild(style);
  return scrollbarWidth;
};
export const SCROLLBAR_WIDTH = getScrollBarWidth();
