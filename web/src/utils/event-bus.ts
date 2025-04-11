/* eslint-disable @typescript-eslint/no-explicit-any */

export class EventBus<
  EventMap extends Record<string, any>,
  T extends keyof EventMap = keyof EventMap,
> {
  private pools: Map<T, Set<(value: any) => void>>;
  constructor() {
    this.pools = new Map();
  }
  public on<K extends T>(event: K, listener: (value: EventMap[K]) => void) {
    if (!this.pools.has(event)) {
      this.pools.set(event, new Set());
    }
    this.pools.get(event)!.add(listener);
    return () => this.off(event, listener);
  }
  public off<K extends T>(event: K, listener: (value: EventMap[K]) => void) {
    this.pools.get(event)?.delete(listener);
  }
  public clear(event: T) {
    this.pools.delete(event);
  }
  public once<K extends T>(event: K, listener: (value: EventMap[K]) => void) {
    const off = this.on(event, (v: EventMap[K]) => {
      listener(v);
      off();
    });
    return off
  }
  public emit<K extends T>(
    ...[event, value]: EventMap[K] extends undefined
      ? [event: K]
      : [event: K, value: EventMap[K]]
  ) {
    if (!this.pools.has(event)) return void 0;
    return Promise.all(
      [...this.pools.get(event)!.values()].map((fn) =>
        fn(value as EventMap[K]),
      ),
    );
  }
  public batch(...unregisters: Array<() => void>) {
    return () => unregisters.forEach((unregister) => unregister());
  }
}
