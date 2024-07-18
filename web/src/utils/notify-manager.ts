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
  }
> {
  private eventSource: EventSource | undefined;
  public clientId: string | undefined;
  private connecting = false;
  private visibilityTimer: number | undefined;
  public keepConnection = false;

  constructor() {
    super();
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('focus', this.handleFocus);
  }

  public async connect(): Promise<string | undefined> {
    if (this.connecting) return void 0;
    this.connecting = true;
    this.clear('CLIENT_ID');
    try {
      return await new Promise((resolve, reject) => {
        const eventSource = new EventSource(`${__ENDPOINT__}/api/notify`);
        eventSource.onmessage = this.handleMessage;
        eventSource.onopen = () => {
          this.once('CLIENT_ID', (id) => {
            this.clientId = id;
            this.emit('CONNECTED');
            resolve(id);
          });
          console.debug('sse connected');
        };
        eventSource.onerror = () => {
          eventSource.close();
          if (
            eventSource.readyState == eventSource.CONNECTING ||
            eventSource.readyState == eventSource.CLOSED
          ) {
            reject(new Error('Failed to connect'));
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
