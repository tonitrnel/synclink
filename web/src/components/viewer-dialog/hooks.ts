import { useMemo } from 'react';
import { loadViewerComponent } from './viewers';

export const useViewerLoader = ({
    filename,
    extname,
    mimetype,
}: {
    filename: string;
    mimetype: string;
    extname?: string;
}) => {
    return useMemo(() => {
        const ext = extname || filename.split('.').pop() || '';
        return loadViewerComponent(mimetype, ext);
    }, [extname, filename, mimetype]);
};

export const useSrc = (resourceId: string, subResourceId?: string) => {
    return useMemo(() => {
        if (subResourceId) {
            return `${__ENDPOINT__}/api/directory/${resourceId}/${subResourceId}`;
        } else {
            return `${__ENDPOINT__}/api/file/${resourceId}`;
        }
    }, [resourceId, subResourceId]);
};
