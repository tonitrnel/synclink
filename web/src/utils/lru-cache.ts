export class Linked<K, T> {
    public prev?: Linked<K, T>;
    public next?: Linked<K, T>;
    constructor(
        public readonly key: K,
        public readonly value: T,
    ) {
        this.prev = void 0;
        this.next = void 0;
    }
}

export class LruCache<K, T> {
    private head?: Linked<K, T>;
    private tail?: Linked<K, T>;
    private readonly linkedMap: Map<K, Linked<K, T>>;
    constructor(private readonly capacity: number) {
        this.head = void 0;
        this.tail = void 0;
        this.linkedMap = new Map();
    }

    public set(key: K, value: T): void {
        if (this.linkedMap.size >= this.capacity) {
            if (this.tail) this.delete(this.tail.key);
        }
        if (this.linkedMap.has(key))
            this.deleteLinked(this.linkedMap.get(key)!);
        this.linkedMap.set(key, this.insertLinked(key, value));
    }
    public delete(key: K) {
        if (!this.linkedMap.has(key)) return void 0;
        const node = this.linkedMap.get(key)!;
        this.linkedMap.delete(node.key);
        this.deleteLinked(node);
    }
    public clear() {
        this.linkedMap.clear();
        this.head = void 0;
        this.tail = void 0;
    }
    public get(key: K): T | undefined {
        if (this.linkedMap.has(key)) {
            const node = this.linkedMap.get(key)!;
            this.updateLinked(node);
            return node.value;
        }
        return void 0;
    }
    public has(key: K): boolean {
        return this.linkedMap.has(key);
    }
    public forEach(
        callbackFn: (value: T, key: K, map: Map<K, Linked<K, T>>) => void,
        thisArg?: unknown,
    ): void {
        this.linkedMap.forEach(
            (node) => callbackFn(node.value, node.key, this.linkedMap),
            thisArg,
        );
    }
    public entries(): IterableIterator<[K, T]> {
        const values = this.linkedMap.values();
        function* iterator() {
            let current = values.next();
            while (!current.done) {
                yield [current.value.key, current.value.value] as [K, T];
                current = values.next();
            }
        }
        return iterator();
    }
    public keys(): IterableIterator<K> {
        const head = this.head;
        const tail = this.tail;
        function* iterator() {
            let node = head;
            while (node !== void 0) {
                yield node.key;
                if (node === tail) return void 0;
                else node = node.next;
            }
        }
        return iterator();
    }
    public values(): IterableIterator<T> {
        const head = this.head;
        const tail = this.tail;
        function* iterator() {
            let node = head;
            while (node !== void 0) {
                yield node.value;
                if (node === tail) return void 0;
                else node = node.next;
            }
        }
        return iterator();
    }
    public get size() {
        return this.linkedMap.size;
    }

    /**
     * 向头插入链表节点
     * @param key
     * @param value
     * @private
     */
    private insertLinked(key: K, value: T) {
        const node = new Linked(key, value);
        if (this.head) {
            node.next = this.head;
            this.head.prev = node;
        }
        this.head = node;
        if (!this.tail) {
            this.tail = node;
        }
        return node;
    }
    /**
     * 将节点更新至链表头部
     * @param node
     * @private
     */
    private updateLinked(node: Linked<K, T>) {
        if (this.head === node) return void 0;
        if (this.tail === node) {
            this.tail = node.prev!;
            this.tail.next = void 0;
        }
        node.next = this.head;
        node.prev = void 0;
        this.head!.prev = node;
        this.head = node;
    }
    /**
     * 删除指定的链表节点
     * @param node
     * @private
     */
    private deleteLinked(node: Linked<K, T>) {
        if (this.head === node && this.tail === node) {
            this.head = void 0;
            this.tail = void 0;
        } else if (this.head === node) {
            this.head = node.next;
            this.head!.prev = void 0;
        } else if (this.tail === node) {
            this.tail = node.prev;
            this.tail!.next = void 0;
        } else {
            node.prev!.next = node.next;
            node.next!.prev = node.prev;
        }
        node.prev = void 0;
        node.next = void 0;
        return node;
    }
}
