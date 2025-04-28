import { FC } from 'react';
import { ViewerProps } from './type';

export const PdfViewer: FC<ViewerProps> = ({ src, onReady }) => {
    return (
        <embed
            src={src}
            onLoad={onReady}
            className="h-full min-h-[60vh] w-full"
        />
    );
};
