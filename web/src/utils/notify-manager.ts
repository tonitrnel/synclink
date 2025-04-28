import { EventBus } from '~/utils/event-bus.ts';

type SseMessageMap = {
    RECORD_ADDED: string;
    RECORD_DELETED: string;
    USER_CONNECTED: string;
    USER_DISCONNECTED: string;
    CLIENT_ID: string;
    P2P_REQUEST: string;
    P2P_REJECT: string;
    HEART: number;
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

class NotifyManager extends EventBus<
    SseMessageMap & {
        CONNECTED: undefined;
        DISCONNECTED: undefined;
    }
> {
    private eventSource: EventSource | undefined;
    public clientId: string | undefined;
    public clientPin: string | undefined;
    private connecting = false;
    private visibilityTimer: number | undefined;
    public keepConnection = false;
    private resolveQueue: Array<
        [resolve: (value: string) => void, reject: (reason: unknown) => void]
    > = [];

    constructor() {
        super();
        document.addEventListener('visibilitychange', this.handleVisibility);
        window.addEventListener('focus', this.handleFocus);
    }

    public async connect(): Promise<string | undefined> {
        if (this.connecting)
            return new Promise((resolve, reject) => {
                this.resolveQueue.push([resolve, reject]);
            });
        this.connecting = true;
        this.clear('CLIENT_ID');
        try {
            return await new Promise((resolve, reject) => {
                const eventSource = new EventSource(
                    `${__ENDPOINT__}/api/notify`,
                );
                eventSource.onmessage = this.handleMessage;
                const timer = window.setTimeout(() => {
                    eventSource.close();
                    reject(new Error('Connection timeout'));
                }, 1600);
                eventSource.onopen = () => {
                    window.clearTimeout(timer);
                    this.once('CLIENT_ID', (value) => {
                        const [id, pin] = value.split(';');
                        this.clientId = id;
                        this.clientPin = pin;
                        this.emit('CONNECTED');
                        resolve(id);
                        while (this.resolveQueue.length > 0) {
                            const [resolve] = this.resolveQueue.pop()!;
                            resolve(id);
                        }
                    });
                    console.debug('sse connected');
                };
                eventSource.onerror = () => {
                    window.clearTimeout(timer);
                    eventSource.close();
                    if (
                        eventSource.readyState == eventSource.CONNECTING ||
                        eventSource.readyState == eventSource.CLOSED
                    ) {
                        const reason = new Error('Failed to connect');
                        reject(reason);
                        while (this.resolveQueue.length > 0) {
                            const [, reject] = this.resolveQueue.pop()!;
                            reject(reason);
                        }
                        return void 0;
                    }
                    if (eventSource.readyState == eventSource.OPEN) {
                        console.debug('sse disconnected, trying to reconnect');
                    }
                };
                this.eventSource = eventSource;
            });
        } finally {
            this.connecting = false;
        }
    }

    public async disconnect(): Promise<void> {
        this.eventSource?.close();
        this.eventSource = undefined;
        this.emit('DISCONNECTED');
    }

    private handleMessage = async (evt: MessageEvent) => {
        const message: SseMessage = JSON.parse(evt.data);
        if (message.type === 'HEART') {
            return void 0;
        }
        // console.log('sse message:', message);
        this.emit(message.type, message.payload);
    };
    private handleVisibility = async () => {
        const visibility = document.visibilityState;
        if (this.visibilityTimer) {
            window.clearTimeout(this.visibilityTimer);
            this.visibilityTimer = undefined;
        }
        if (visibility === 'visible') {
            if (this.keepConnection) return void 0;
            this.visibilityTimer = window.setTimeout(() => {
                if (this.keepConnection) return void 0;
                console.debug('inactive for more than 60s');
                this.visibilityTimer = undefined;
                this.disconnect();
            }, 6_000);
        } else {
            await this.ensureWork();
        }
    };
    private handleFocus = async () => {
        if (this.visibilityTimer) {
            window.clearTimeout(this.visibilityTimer);
            this.visibilityTimer = undefined;
        }
        await this.ensureWork();
    };
    public ensureWork = async () => {
        if (
            this.eventSource &&
            this.eventSource.readyState == this.eventSource.OPEN
        ) {
            return void 0;
        }
        await this.connect();
    };
}

export const notifyManager = new NotifyManager();
