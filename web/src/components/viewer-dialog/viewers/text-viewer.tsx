import { FC, useEffect, useState } from 'react';
import { ViewerProps } from './type';

export const TextViewer: FC<ViewerProps> = ({ src, onReady, onError }) => {
    const [content, setContent] = useState('');
    useEffect(() => {
        // console.log('text src', src);
        fetch(src).then(
            async (res) => {
                setContent(await res.text());
                onReady();
            },
            (reason) => onError(reason),
        );
    }, [onError, onReady, src]);
    return (
        <p className="bg-background mt-0 min-h-[32px] w-full p-2 leading-relaxed break-words whitespace-break-spaces text-gray-900">
            {content}
        </p>
    );
};
