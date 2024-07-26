import { FC } from 'react';
import { ViewerProps } from './type';

export const ImageViewer: FC<ViewerProps> = ({
  src,
  filename,
  caption,
  onReady,
  onError,
}) => {
  return (
    <figure className="w-full">
      <img
        src={src}
        alt={filename}
        onLoad={onReady}
        onError={onError}
        className="rounded object-contain w-full"
      />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
};
