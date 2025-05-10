import { EventBus } from '~/utils/event-bus.ts';
import { useLayoutEffect, useState } from 'react';
import { wait } from '~/utils/wait.ts';

type SseMessageMap = {
    RECORD_ADDED: string;
    RECORD_REMOVED: string;
    USER_CONNECTED: string;
    USER_DISCONNECTED: string;
    CLIENT_ID: string;
    HEART: number;
    P2P_REQUEST: string;
    P2P_REJECTED: string;
    P2P_CANCELED: string;
    P2P_DOWNGRADED: string;
    P2P_EXCHANGE: {
        request_id: string;
        protocol: 'webrtc' | 'websocket';
        participants: [string, string];
    };
    P2P_SIGNALING: [0, RTCSessionDescriptionInit] | [1, RTCIceCandidate];
};

type ToEventUnion<T extends Record<string, unknown>> = {
    [P in keyof T]: {
        type: P;
        payload: T[P];
    };
}[keyof T];

type SseMessage = ToEventUnion<SseMessageMap>;

export interface NotifyOptions {
    endpoint: string;
    maxReconnectAttempts?: number;
    reconnectIntervalMs?: number;
    idleDisconnectMs?: number;
}

class NotifyManager extends EventBus<
    SseMessageMap & {
        CONNECTED: undefined;
        DISCONNECTED: undefined;
        RECONNECT_ATTEMPT: number;
        RECONNECT_FAILED: void;
    }
> {
    private sse: EventSource | undefined;
    public clientId: string | undefined;
    public clientPin: string | undefined;
    public keepConnection: boolean = false;

    private isConnecting = false;

    private pendingResolvers: Array<
        [resolve: (value: string) => void, reject: (reason: unknown) => void]
    > = [];

    private reconnectAttempts = 0;
    private options: Required<NotifyOptions>;
    private idleTimer: number | undefined;

    constructor(options: NotifyOptions) {
        super();
        this.options = {
            maxReconnectAttempts: 3,
            reconnectIntervalMs: 2000,
            idleDisconnectMs: 60000,
            ...options,
        };
        document.addEventListener(
            'visibilitychange',
            this.handleVisibilityChange,
        );
        window.addEventListener('focus', this.handleWindowFocus);
    }

    /**
     * 建立 SSE 连接
     */
    public async connect(): Promise<string> {
        if (this.clientId) {
            return this.clientId;
        }
        if (this.isConnecting)
            return new Promise((resolve, reject) => {
                this.pendingResolvers.push([resolve, reject]);
            });

        this.isConnecting = true;
        this.flushPending();

        return new Promise<string>((resolve, reject) => {
            const url = `${this.options.endpoint}/api/notify`;
            this.sse = new EventSource(url, { withCredentials: true });
            const timeout = window.setTimeout(() => {
                this.teardown();
                reject(new Error('SSE connection timed out'));
            }, 3000);
            this.sse.onopen = () => {
                window.clearTimeout(timeout);
                this.reconnectAttempts = 0;
                console.debug('[NotifyService] SSE connected');
            };
            this.sse.onerror = () => {
                window.clearTimeout(timeout);
                this.handleError(new Error('SSE connection error'), reject);
            };
            this.sse.onmessage = (evt) => {
                const msg: SseMessage = JSON.parse(evt.data);
                if (msg.type === 'CLIENT_ID') {
                    this.clientId = msg.payload.split(';')[0];
                    this.clientPin = msg.payload.split(';')[1];
                    this.emit('CONNECTED');

                    resolve(this.clientId);
                    this.flushPending(null, this.clientId);
                    return;
                }

                if (msg.type === 'HEART') return;
                this.emit(msg.type, msg.payload);
            };
        }).finally(() => {
            this.isConnecting = false;
        });
    }

    /**
     * 立即断开 SSE 连接
     */
    public async disconnect(): Promise<void> {
        this.sse?.close();
        this.sse = undefined;
        this.emit('DISCONNECTED');
    }

    /**
     * 确保连接是活跃的，或尝试重连中
     */
    public ensureConnected = async (): Promise<string | undefined> => {
        if (this.sse && this.sse.readyState == EventSource.OPEN) {
            return this.clientId;
        }
        try {
            return await this.attemptReconnect();
        } catch {
            return undefined;
        }
    };

    private async attemptReconnect(): Promise<string> {
        while (this.reconnectAttempts < this.options.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this.emit('RECONNECT_ATTEMPT', this.reconnectAttempts);
            try {
                return await this.connect();
            } catch (err) {
                console.warn(
                    `[NotifyService] Reconnect #${this.reconnectAttempts} failed`,
                    err,
                );
                await wait(this.options.reconnectIntervalMs);
            }
        }

        this.emit('RECONNECT_FAILED');
        throw new Error('Max reconnect attempts reached');
    }

    private handleError(err: Error, reject: (reason?: unknown) => void) {
        this.teardown();
        reject(err);
        this.flushPending(err);
        this.emit('DISCONNECTED');
    }

    private teardown() {
        if (this.sse) {
            this.sse.close();
            this.sse = undefined;
        }
        this.clientId = undefined;
        this.clientPin = undefined;
    }

    private flushPending(error: unknown = null, id?: string) {
        this.pendingResolvers.forEach(([resolve, reject]) => {
            if (error) {
                reject(error);
            } else {
                resolve(id!);
            }
        });
        this.pendingResolvers = [];
    }

    private handleVisibilityChange = () => {
        if (this.idleTimer) {
            window.clearTimeout(this.idleTimer);
            this.idleTimer = undefined;
        }
        if (document.visibilityState === 'hidden') {
            if (this.keepConnection) return void 0;
            this.idleTimer = window.setTimeout(() => {
                this.disconnect().catch(console.error);
            }, this.options.idleDisconnectMs);
        } else {
            this.ensureConnected().catch(console.error);
        }
    };
    private handleWindowFocus = () => {
        if (this.idleTimer) {
            window.clearTimeout(this.idleTimer);
            this.idleTimer = undefined;
        }
        this.ensureConnected().catch(console.error);
    };

    // private destory() {
    //     this.disconnect().catch(console.error);
    //     document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    //     document.removeEventListener('focus', this.handleWindowFocus);
    //     this.flushPending(new Error('NotifyManager destroyed'));
    // }
}

export const notifyManager = new NotifyManager({
    endpoint: __ENDPOINT__,
});
export const useNotifyOnline = (): boolean => {
    const [online, setOnline] = useState<boolean>(false);
    useLayoutEffect(() => {
        return notifyManager.batch(
            notifyManager.on('CONNECTED', () => setOnline(true)),
            notifyManager.on('DISCONNECTED', () => setOnline(false)),
        );
    }, []);
    return online;
};
