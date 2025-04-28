import { createHttpFactory } from '~/utils/http';

export type { ExtractSchemaType } from '~/utils/http';

export * from './file.ts';
export * from './p2p.ts';
export * from './upload.ts';

export const useVersionQuery = createHttpFactory('GET:/api/version')
    .apply<'Response', string>()
    .makeQuery();

export const useStatsQuery = createHttpFactory('GET:/api/stats')
    .apply<
        'Response',
        {
            uptime: number;
            disk_usage: number;
            memory_usage: number;
            version: string;
            default_reserved: number;
            storage_quota: number;
            query_elapsed: number;
        }
    >()
    .makeQuery();

export const useSSEConnectionsQuery = createHttpFactory(
    'GET:/api/sse/connections',
)
    .apply<
        'Response',
        {
            id: string;
            ip_alias: string | null;
            user_agent: string;
        }[]
    >()
    .makeQuery();
