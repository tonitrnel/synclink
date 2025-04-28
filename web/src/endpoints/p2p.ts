import { createHttpFactory } from '~/utils/http';

export const useCreateP2PMutation = createHttpFactory('POST:/api/p2p/create')
    .apply<
        'Body',
        {
            client_id: string;
            code?: string;
            supports_webrtc: boolean;
            priority?: 'webrtc' | 'websocket';
        }
    >()
    .apply<
        'Response',
        {
            request_id: string;
            status: 'pending';
        }
    >()
    .makeQuery();

export const useAcceptP2PMutation = createHttpFactory('POST:/api/p2p/accept')
    .apply<
        'Body',
        {
            request_id: string;
            client_id: string;
            supports_webrtc: boolean;
        }
    >()
    .apply<
        'Response',
        {
            status: 'accepted';
        }
    >()
    .makeMutation();

export const useDiscardP2PMutation = createHttpFactory(
    'DELETE:/api/p2p/discard',
)
    .apply<
        'Body',
        {
            request_id: string;
            client_id: string;
        }
    >()
    .apply<
        'Response',
        {
            status: 'canceled' | 'rejected';
        }
    >()
    .makeMutation();

export const sendP2PSignaling = createHttpFactory('POST:/api/p2p/signaling')
    .apply<
        'Body',
        {
            request_id: string;
            client_id: string;
            payload: [0, RTCSessionDescriptionInit] | [1, RTCIceCandidate];
        }
    >()
    .apply<'Response', string>()
    .makeRequest();

export const sendP2PDowngrade = createHttpFactory('POST:/api/p2p/downgrade')
    .apply<
        'Body',
        {
            client_id: string;
            request_id: string;
        }
    >()
    .apply<'Response', string>()
    .makeRequest();