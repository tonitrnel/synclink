export type TextEncoding = 'iso-8859-1' | 'utf-8' | 'utf-16le' | 'utf-16ge';

export abstract class Reader {
    abstract len(): number;

    abstract offset(): number;

    abstract read(len: number): Promise<Uint8Array> | Uint8Array;

    abstract peek(len: number): Promise<Uint8Array> | Uint8Array;

    abstract skip(len: number): void;

    abstract is_end(): boolean;

    abstract read_next_u8(): Promise<number> | number;

    abstract read_next_u16(is_big_endian: boolean): Promise<number> | number;

    abstract read_next_u32(is_big_endian: boolean): Promise<number> | number;

    abstract read_next_u64(is_big_endian: boolean): Promise<number> | number;

    abstract read_string(
        len: number,
        encoding: TextEncoding,
    ): Promise<string> | string;

    abstract read_variant_string(
        encoding: TextEncoding,
    ): Promise<string> | string;
}

/**
 * Converts a Uint8Array of bytes to an integer.
 * @param bytes The Uint8Array containing the bytes to convert.
 * @param is_big_endian Optional. Specifies whether the byte order is big-endian (default) or little-endian.
 * @returns The converted number.
 */
export const bytes_to_integer = (bytes: Uint8Array, is_big_endian = true) => {
    const len = bytes.length;
    const arr = is_big_endian ? Array.from(bytes) : Array.from(bytes).reverse();
    return arr.reduce((prev, next, idx) => {
        return prev | (next << ((len - idx - 1) * 8));
    }, 0);
};
export const bytes_equals = (
    a: Uint8Array | Array<number>,
    b: number[],
): boolean => {
    if (a.length != b.length) return false;
    return !b.some((it, i) => a[i] != it);
};
