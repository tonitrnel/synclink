import { BytesReader } from '../reader';

export class VorbisComment {
    constructor(
        public readonly vendor: string,
        public readonly comments: ReadonlyArray<[key: string, value: string]>,
    ) {}

    public static new(bytes: Uint8Array): VorbisComment {
        const reader = BytesReader.new(bytes);
        return VorbisComment.with_byte_reader(reader);
    }

    public static with_byte_reader(reader: BytesReader): VorbisComment {
        const vendor_len = reader.read_next_u32(false);
        const vendor = reader.read_string(vendor_len);
        const length = reader.read_next_u32(false);
        const comments: Array<[string, string]> = [];
        while (!reader.is_end() && comments.length < length) {
            const len = reader.read_next_u32(false);
            const part = reader.read_string(len).split('=');
            comments.push([part[0].toUpperCase(), part[1]]);
        }
        return new VorbisComment(vendor, comments);
    }

    public to_map(): Map<string, string> {
        return new Map(this.comments);
    }
}
