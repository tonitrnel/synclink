import { createHttpFactory } from '@painted/http';

export const useGetList = createHttpFactory('GET:/api')
  .apply<
    'Query',
    {
      page?: number;
      per_page?: number;
      sort_by?: string;
      order_by?: string;
      group_by?: string;
      after?: number;
      before?: number;
      query?: string;
    }
  >()
  .apply<
    'Response',
    {
      total: number;
      data: {
        uid: string;
        created: number;
        name: string;
        size: number;
        type: string;
        ext?: string;
        ip?: string;
        ip_alias?: string;
        metadata?: {
          width: number;
          height: number;
        };
      }[];
    }
  >()
  .doQueryRequest();

export const useGetFileContent = createHttpFactory('GET:/api/file/{id}')
  .apply<'Response', string>()
  .doQueryRequest();

export const useGetStats = createHttpFactory('GET:/api/stats')
  .apply<
    'Response',
    {
      uptime: number;
      disk_usage: number;
      memory_usage: number;
      version: string;
    }
  >()
  .doQueryRequest();
