import {
  TextEncoding,
  Reader,
  bytes_to_integer,
  bytes_equals,
} from './reader.ts';

export class BytesReader extends Reader {
  private _offset = 0;

  constructor(private readonly _bytes: Uint8Array) {
    super();
  }

  public static new(bytes: Uint8Array) {
    return new BytesReader(bytes);
  }

  public static with_offset(bytes: Uint8Array, offset: number) {
    const instance = new BytesReader(bytes);
    instance._offset = offset;
    return instance;
  }

  public len(): number {
    return this._bytes.length;
  }

  public offset(): number {
    return this._offset;
  }

  public is_end(): boolean {
    return this._offset >= this._bytes.length - 1;
  }

  public read(len: number): Uint8Array {
    const end = this._offset + len;
    const bytes = this._bytes.slice(this._offset, end);
    this._offset = end;
    return bytes;
  }

  public read_remaining(): Uint8Array {
    const bytes = this._bytes.slice(this._offset);
    this._offset = this._bytes.length;
    return bytes;
  }

  public peek(len: number): Uint8Array {
    const end = this._offset + len;
    return this._bytes.slice(this._offset, end);
  }

  public skip(len: number) {
    this._offset += len;
  }

  public read_next_u8(): number {
    return this.read(1)[0];
  }

  public read_next_u16(is_big_endian: boolean): number {
    return bytes_to_integer(this.read(2), is_big_endian);
  }

  public read_next_u32(is_big_endian: boolean): number {
    return bytes_to_integer(this.read(4), is_big_endian);
  }

  public read_next_i32(is_big_endian: boolean): number {
    return bytes_to_integer(this.read(4), is_big_endian);
  }

  public read_next_u64(is_big_endian: boolean): number {
    return bytes_to_integer(this.read(8), is_big_endian);
  }

  public read_string(len: number, encoding: TextEncoding = 'utf-8'): string {
    return new TextDecoder(encoding).decode(this.read(len));
  }

  public read_variant_string(encoding: TextEncoding = 'utf-8'): string {
    const len = this.len();
    if (encoding == 'utf-16le' || encoding == 'utf-16ge') {
      const start = (() => {
        const head = this.peek(2);
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
        !bytes_equals([this._bytes[cur], this._bytes[cur + 1]], [0x00, 0x00])
      ) {
        cur += 2;
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
      }
      if (cur == start) {
        this._offset += 1;
        return '';
      } else {
        const string = this.read_string(cur - start, 'utf-8');
        this._offset = cur + 1;
        return string;
      }
    }
  }
}
