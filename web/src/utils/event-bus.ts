type EventParameter<T> = T extends [infer U, unknown] ? U : T;
type EventReturnType<T> = T extends [unknown, infer U] ? U : void;
type UnknownEventFn = (value: unknown) => unknown;
type EmitReturnType<T> = T extends Promise<infer U> ? Promise<U[]> : T[];

export class EventBus<
    EventMap extends Record<
        string,
        unknown | [input: unknown, output: unknown]
    >,
    T extends keyof EventMap = keyof EventMap,
> {
    private pools: Map<T, Set<(value: unknown) => unknown>>;

    constructor() {
        this.pools = new Map();
    }

    public on<K extends T>(
        event: K,
        listener: (
            value: EventParameter<EventMap[K]>,
        ) => EventReturnType<EventMap[K]>,
    ) {
        if (!this.pools.has(event)) {
            this.pools.set(event, new Set());
        }
        this.pools.get(event)!.add(listener as UnknownEventFn);
        return () => this.off(event, listener);
    }

    public off<K extends T>(
        event: K,
        listener: (
            value: EventParameter<EventMap[K]>,
        ) => EventReturnType<EventMap[K]>,
    ) {
        this.pools.get(event)?.delete(listener as UnknownEventFn);
    }

    public clear(event: T) {
        this.pools.delete(event);
    }

    public once<K extends T>(
        event: K,
        listener: (
            value: EventParameter<EventMap[K]>,
        ) => EventReturnType<EventMap[K]>,
    ) {
        const off = this.on(event, (v: EventParameter<EventMap[K]>) => {
            const ret = listener(v);
            off();
            return ret;
        });
        return off;
    }

    public emit<K extends T>(
        ...[event, value]: EventMap[K] extends undefined
            ? [event: K]
            : [event: K, value: EventParameter<EventMap[K]>]
    ): EmitReturnType<EventReturnType<EventMap[K]>> | void {
        if (!this.pools.has(event)) return void 0;
        const returns = [...this.pools.get(event)!.values()].map((fn) =>
            fn(value as EventMap[K]),
        );
        if (returns.some((it) => it instanceof Promise)) {
            return Promise.all(returns) as EmitReturnType<
                EventReturnType<EventMap[K]>
            >;
        } else {
            return returns as EmitReturnType<EventReturnType<EventMap[K]>>;
        }
    }

    public batch(...unregisters: Array<() => void>) {
        return () => unregisters.forEach((unregister) => unregister());
    }
}
