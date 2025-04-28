import {
    Reader,
    TextEncoding,
    bytes_to_integer,
    bytes_equals,
} from './reader.ts';

export class RemoteReader extends Reader {
    private _offset = 0;
    private _bytes = new Uint8Array();
    private _total = 0;
    private _initialize = false;
    private _cors_header_tip = false;

    constructor(
        public readonly url: string,
        private readonly chunk_size = 4096,
    ) {
        super();
    }

    public len(): number {
        return this._total;
    }

    public offset(): number {
        return this._offset;
    }

    public is_end(): boolean {
        return this._offset >= this._total - 1;
    }

    /**
     * Initializes the object by fetching the content range from the specified URL.
     * It retrieves the first 4 bytes of the content for easy identification of the file format.
     * @throws {Error} If there is an issue with fetching the content range or the response status is not 206 (Partial Content).
     */
    public async init(): Promise<void> {
        if (this._initialize) return void 0;
        const res = await fetch(this.url, {
            headers: {
                range: `bytes=0-3`, // get first 4 bytes to easy identification of the file format.
            },
        });
        if (res.status !== 206) {
            throw new Error('Failed to fetch the content range');
        }
        this._total = (() => {
            const ranges = res.headers.get('content-range')?.slice(6);
            if (!ranges || ranges === '') {
                if (!this._cors_header_tip) {
                    this._cors_header_tip = true;
                    console.warn(
                        'Can\'t read "content-range" field in headers, This may be a cors issue, see https://stackoverflow.com/questions/43344819/reading-response-headers-with-fetch-api/44816592#44816592',
                    );
                }
                throw new Error(`can't read "content-range" field in headers`);
            }
            const range = ranges.split(',')[0];
            const [, total] = range.split('/');
            return parseInt(total);
        })();
        const buf = await res.arrayBuffer();
        this._bytes = new Uint8Array([...this._bytes, ...new Uint8Array(buf)]);
        this._initialize = true;
    }

    private async ensure(end: number) {
        if (end >= this._total) {
            throw new Error(
                'Requested data exceeds the total available data size.',
            );
        }
        if (end >= this._bytes.length) {
            const size =
                Math.ceil((end - this._bytes.length) / this.chunk_size) *
                this.chunk_size;
            const res = await fetch(this.url, {
                headers: {
                    range: `bytes=${this._bytes.length}-${this._bytes.length + size}`,
                },
            });
            if (res.status !== 206) {
                throw new Error('Failed to fetch the content range');
            }
            const buf = await res.arrayBuffer();
            this._bytes = new Uint8Array([
                ...this._bytes,
                ...new Uint8Array(buf),
            ]);
        }
    }

    /**
     * Reads a specified length of data from the content, starting from the current offset.
     * If necessary, it fetches additional data to ensure the requested length is available.
     * @param len The length of data to read.
     * @returns A Promise that resolves to a Uint8Array containing the read data.
     * @throws {Error} If there is an issue with fetching the content range.
     */
    public async read(len: number): Promise<Uint8Array> {
        const end = this._offset + len;
        await this.ensure(end);
        const bytes = this._bytes.slice(this._offset, end);
        this._offset = end;
        return bytes;
    }

    /**
     * Peeks into the content and retrieves a specified length of data from the current offset without advancing the offset.
     * If necessary, it fetches additional data to ensure the requested length is available.
     * @param len The length of data to peek.
     * @returns A Promise that resolves to a Uint8Array containing the peeked data.
     * @throws {Error} If there is an issue with fetching the content range.
     */
    public async peek(len: number): Promise<Uint8Array> {
        const end = this._offset + len;
        await this.ensure(end);
        return this._bytes.slice(this._offset, end);
    }

    /**
     * Skips a specified length of data from the content by advancing the offset.
     * @param len The length of data to skip.
     */
    public skip(len: number) {
        this._offset += len;
    }

    public read_next_u8(): Promise<number> {
        return this.read(1).then((bytes) => bytes[0]);
    }

    public read_next_u16(is_big_endian: boolean): Promise<number> {
        return this.read(2).then((bytes) =>
            bytes_to_integer(bytes, is_big_endian),
        );
    }

    public read_next_u32(is_big_endian: boolean): Promise<number> {
        return this.read(4).then((bytes) =>
            bytes_to_integer(bytes, is_big_endian),
        );
    }

    // actually only 52 bits, js not supported u64, but really that big of an audio file?
    public read_next_u64(is_big_endian: boolean): Promise<number> {
        return this.read(8).then((bytes) =>
            bytes_to_integer(bytes, is_big_endian),
        );
    }

    public read_string(
        len: number,
        encoding: TextEncoding = 'utf-8',
    ): Promise<string> {
        return this.read(len).then((bytes) =>
            new TextDecoder(encoding).decode(bytes),
        );
    }

    public async read_variant_string(
        encoding: TextEncoding = 'utf-8',
    ): Promise<string> {
        const len = this.len();
        if (encoding == 'utf-16le' || encoding == 'utf-16ge') {
            const start = await (async () => {
                const head = await this.peek(2);
                if (
                    bytes_equals(head, [0xff, 0xfe]) ||
                    bytes_equals(head, [0xfe, 0xff])
                ) {
                    this._offset += 2;
                    return this._offset;
                } else {
                    return this._offset;
                }
            })();
            let cur = start;
            while (
                cur < len &&
                !bytes_equals(
                    [this._bytes[cur], this._bytes[cur + 1]],
                    [0x00, 0x00],
                )
            ) {
                cur += 2;
                if (cur >= this._bytes.length) {
                    // load next chunk
                    await this.ensure(this._bytes.length);
                }
            }
            if (cur == start) {
                // skip zero
                this._offset = cur + 2;
                return '';
            } else {
                const string = this.read_string(cur - start, encoding);
                this._offset = cur + 2;
                return string;
            }
        } else {
            const start = this.offset();
            let cur = start;
            while (cur < len && this._bytes[cur] != 0x00) {
                cur += 1;
                if (cur >= this._bytes.length) {
                    // load next chunk
                    await this.ensure(this._bytes.length);
                }
            }
            if (cur == start) {
                this._offset += 1;
                return '';
            } else {
                const string = await this.read_string(cur - start, 'utf-8');
                this._offset = cur + 1;
                return string;
            }
        }
    }
}
