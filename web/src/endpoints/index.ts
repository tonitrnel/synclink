import { createHttpFactory } from '@painted/http';
import type { InferSType } from '@painted/http';

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
        tags?: string[];
        caption?: string;
        metadata?: {
          width: number;
          height: number;
          thumbnail_width?: number;
          thumbnail_height?: number;
        };
      }[];
    }
  >()
  .doQueryRequest();

export const useGetFileContent = createHttpFactory('GET:/api/file/{id}')
  .apply<'Response', string>()
  .doQueryRequest();

export const useGetTextCollection = createHttpFactory(
  'POST:/api/text-collection',
)
  .apply<'Response', string>()
  .apply<'Body', { uuids: string[] }>()
  .doRequest();

export const useGetStats = createHttpFactory('GET:/api/stats')
  .apply<
    'Response',
    {
      uptime: number;
      disk_usage: number;
      memory_usage: number;
      version: string;
      default_reserved: number;
      storage_quota: number;
    }
  >()
  .doQueryRequest();

export const useGetDirectory = createHttpFactory('GET:/api/directory/{id}')
  .apply<
    'Response',
    {
      path: string;
      mtime: number;
      size: number;
      mimetype: string | null;
      is_file: boolean;
      hash: string | null;
    }[]
  >()
  .doQueryRequest();

export const useGetSseConnections = createHttpFactory(
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
  .doQueryRequest();

export const usePostCreateP2PRequest = createHttpFactory('POST:/api/p2p/create')
  .apply<
    'Body',
    {
      client_id: string;
      target_id: string;
      target_pin?: string;
      supports_rtc: boolean;
      priority?: 'webrtc' | 'websocket';
    }
  >()
  .apply<
    'Response',
    {
      request_id: string;
      status: string;
    }
  >()
  .doMutationRequest();

export const usePostAcceptP2PRequest = createHttpFactory('POST:/api/p2p/accept')
  .apply<
    'Body',
    {
      request_id: string;
      client_id: string;
      supports_rtc: boolean;
    }
  >()
  .apply<
    'Response',
    {
      status: string;
    }
  >()
  .doMutationRequest();

export const useDeleteDiscardP2PRequest = createHttpFactory(
  'DELETE:/api/p2p/discard',
)
  .apply<
    'Body',
    {
      request_id: string;
    }
  >()
  .apply<
    'Response',
    {
      msg: string;
    }
  >()
  .doMutationRequest();

export const sendP2PSignaling = createHttpFactory('POST:/api/p2p/signaling')
  .apply<
    'Body',
    {
      request_id: string;
      client_id: string;
      payload: [0, RTCSessionDescriptionInit] | [1, RTCIceCandidate];
    }
  >()
  .apply<'Response', { msg: string }>()
  .doRequest();

export type InferResponse<T> = InferSType<T, 'Response'>;
