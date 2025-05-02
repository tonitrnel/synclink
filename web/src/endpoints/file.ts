import { createHttpFactory } from '~/utils/http';

export const useListQuery = createHttpFactory('GET:/api/file/list')
    .apply<
        'Query',
        {
            first?: number;
            after?: string;
            last?: number;
            before?: string;
            group?: string;
            with_total?: boolean;
        }
    >()
    .apply<
        'Response',
        {
            has_prev: boolean;
            data: {
                id: string;
                name: string;
                hash: string;
                size: number;
                extname: string;
                mimetype: string;
                ipaddr?: string;
                device?: string;
                metadata?:
                    | {
                          type: 'image';
                          width: number;
                          height: number;
                          thumbnail_width?: number;
                          thumbnail_height?: number;
                      }
                    | {
                          type: 'archive';
                          entries: {
                              path: string;
                              mtime: number;
                              size: number;
                              mimetype?: string;
                              is_file: boolean;
                              hash?: string;
                          }[];
                      };
                is_encrypted: boolean;
                is_pined: boolean;
                created_at: number;
                updated_at: number;
                cursor: string;
            }[];
            has_next: boolean;
            total?: number;
        }
    >()
    .makeQuery();

export const useFileContentQuery = createHttpFactory('GET:/api/file/{id}')
    .apply<'Response', string>()
    .makeQuery();

export const fetchTextCollection = createHttpFactory(
    'POST:/api/file/text-collection',
)
    .apply<'Response', string>()
    .apply<'Body', { uuids: string[] }>()
    .makeRequest();

export const useDirectoryQuery = createHttpFactory('GET:/api/directory/{id}')
    .apply<
        'Response',
        {
            path: string;
            mtime: number;
            size: number;
            mimetype?: string;
            is_file: boolean;
            hash?: string;
        }[]
    >()
    .makeQuery();

export const patchFileMetadata = createHttpFactory(
    'PATCH:/api/file/{id}/metadata',
)
    .apply<
        'Body',
        {
            type: 'image';
            width: number;
            height: number;
            thumbnail_width?: number;
            thumbnail_height?: number;
        }
    >()
    .apply<'Response', string>()
    .makeRequest();
