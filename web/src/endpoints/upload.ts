import { createHttpFactory } from '~/utils/http';

export const checkUploadPreflight = createHttpFactory(
    'HEAD:/api/upload/preflight',
)
    .apply<
        'Query',
        {
            size: number;
            hash: string;
        }
    >()
    .makeRequest();

export const createFileUpload = createHttpFactory('POST:/api/upload')
    .apply<
        'Query',
        {
            tags?: string;
            caption?: string;
            hash: string;
            filename: string;
        }
    >()
    .apply<'Body', File>()
    .apply<'Response', string>()
    .makeRequest();

export const startMultipartUploadSession = createHttpFactory(
    'POST:/api/upload/multipart/start-session',
)
    .apply<'Body', { hash: string; size: number }>()
    .apply<'Response', string>()
    .makeRequest();

export const finalizeMultipartUpload = createHttpFactory(
    'POST:/api/upload/multipart/{uuid}/finalize',
)
    .apply<
        'Body',
        {
            tags?: string[];
            caption?: string;
            filename: string;
            mimetype: string;
        }
    >()
    .apply<'Response', string>()
    .makeRequest();

export const cancelMultipartUpload = createHttpFactory(
    'DELETE:/api/upload/multipart/{uuid}/cancel',
)
    .apply<'Response', string>()
    .makeRequest();
