import { FC } from 'react';
import { ViewerProps } from './type';

export const PdfViewer: FC<ViewerProps> = ({ src, onReady }) => {
  return <embed src={src} onLoad={onReady} className="w-full h-full min-h-[360px]" />;
};
