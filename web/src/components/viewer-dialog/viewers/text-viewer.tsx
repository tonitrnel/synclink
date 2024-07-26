import { FC, useEffect, useState } from 'react';
import { ViewerProps } from './type';

export const TextViewer: FC<ViewerProps> = ({ src, onReady, onError }) => {
  const [content, setContent] = useState('');
  useEffect(() => {
    console.log("text src", src);
    fetch(src).then(
      async (res) => {
        setContent(await res.text());
        onReady();
      },
      (reason) => onError(reason),
    );
  }, [onError, onReady, src]);
  return (
    <p className="w-full whitespace-break-spaces break-words text-gray-900 mt-0 min-h-[32px] leading-relaxed p-2 max-h-[360px]">
      {content}
    </p>
  );
};
