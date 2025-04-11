import { RefObject, useEffect } from 'react';

export const useTabkeyRewrite = (
  ref: RefObject<HTMLTextAreaElement>,
  setText: (text: string) => void,
) => {
  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return void 0;
    const onKeydown = (evt: KeyboardEvent) => {
      if (document.activeElement != textarea) return void 0;
      if (evt.key == 'Tab' && !evt.shiftKey) {
        evt.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;
        const newValue =
          value.substring(0, start) + '    ' + value.substring(end);
        setText(newValue);
        if (end == value.length) return void 0;
        window.requestAnimationFrame(() => {
          textarea.selectionStart = start + 4;
          textarea.selectionEnd = start + 4;
        });
      }
    };
    textarea.addEventListener('keydown', onKeydown);
    return () => {
      textarea.removeEventListener('keydown', onKeydown);
    };
  }, [ref, setText]);
};
