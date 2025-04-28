import { RemoteReader, BytesReader, bytes_equals } from '../reader';
import { VorbisComment } from './vorbis-comment.ts';

const OGG_SIGNATURE = [0x4f, 0x67, 0x67, 0x53];
type OggParsedPage =
    | Segment
    | VorbisIdentification
    | OpusIdentification
    | Comments;

export class OggParser {
    constructor(public readonly pages: ReadonlyArray<OggParsedPage>) {}

    public static async new(reader: RemoteReader): Promise<OggParser> {
        if (!(await OggParser.is(reader))) {
            throw new Error('Invalid ogg audio format.');
        }
        const segments: Segment[] = [];
        let full_page = 0;
        while (!reader.is_end() && full_page < 2) {
            const segment = await Segment.new(reader);
            segments.push(segment);
            if (segment.flags == 0x00) {
                full_page += 1;
            }
        }
        const pages: OggParsedPage[] = [];
        const buf = OggParser.load_fulldata(segments, 0);
        if (OpusIdentification.is_opus_format(buf)) {
            pages.push(OpusIdentification.new(buf));
        } else if (VorbisIdentification.is_vorbis_format(buf)) {
            pages.push(VorbisIdentification.new(buf));
        }
        if (pages.length === 0) {
            return new OggParser(pages);
        }
        const comments = Comments.new(OggParser.load_fulldata(segments, 1));
        if (comments) pages.push(comments);
        return new OggParser(pages);
    }

    public static async is(reader: RemoteReader): Promise<boolean> {
        return reader
            .peek(4)
            .then((bytes) => bytes_equals(bytes, OGG_SIGNATURE));
    }

    public static load_fulldata(
        segments: Segment[],
        start: number,
    ): Uint8Array {
        let buf = new Uint8Array();
        let cur = start;
        while (cur < segments.length) {
            const segment = segments[cur];
            if (cur > start && segment.flags != 0x01) {
                break;
            }
            buf = new Uint8Array([...buf, ...segment.data]);
            cur += 1;
            if (segment.flags == 0x04) {
                break;
            }
        }
        return buf;
    }
}

export class Segment {
    constructor(
        public readonly signature: string,
        public readonly version: number,
        public readonly flags: number,
        public readonly granule_position: number,
        public readonly serial_number: number,
        public readonly sequence_number: number,
        public readonly checksum: number,
        public readonly total_segments: number,
        public readonly size: number,
        public readonly data: Uint8Array,
    ) {}

    public static async new(reader: RemoteReader): Promise<Segment> {
        if (
            await reader
                .peek(4)
                .then((bytes) => !bytes_equals(bytes, OGG_SIGNATURE))
        ) {
            throw new Error('Invalid ogg segment format.');
        }
        const signature = await reader.read_string(4);
        const version = await reader.read_next_u8();
        const flags = await reader.read_next_u8();
        const granule_position = await reader.read_next_u64(true);
        const serial_number = await reader.read_next_u32(true);
        const sequence_number = await reader.read_next_u32(true);
        const checksum = await reader.read_next_u32(true);
        const total_segments = await reader.read_next_u8();
        const segment_size = await reader
            .read(total_segments)
            .then((bytes) => bytes.reduce((a, b) => a + b, 0));
        const data = await reader.read(segment_size);
        return new Segment(
            signature,
            version,
            flags,
            granule_position,
            serial_number,
            sequence_number,
            checksum,
            total_segments,
            segment_size,
            data,
        );
    }
}

export class VorbisIdentification {
    constructor(
        public readonly version: number,
        public readonly channels: number,
        public readonly sample_rate: number,
        public readonly bitrate_maximum: number,
        public readonly bitrate_nominal: number,
        public readonly bitrate_minimum: number,
        public readonly blocksize_1: number,
        public readonly blocksize_2: number,
        public readonly framing_flag: number,
    ) {}

    public static new(bytes: Uint8Array): VorbisIdentification {
        const reader = BytesReader.new(bytes);
        reader.skip(7);
        const vorbis_version = reader.read_next_u32(false);
        const audio_channels = reader.read_next_u8();
        const audio_sample_rate = reader.read_next_u32(false);
        const bitrate_maximum = reader.read_next_i32(false);
        const bitrate_nominal = reader.read_next_i32(false);
        const bitrate_minimum = reader.read_next_i32(false);
        const blocksize = reader.read_next_u8();
        const framing_flag = reader.read_next_u8() & 0x01;
        return new VorbisIdentification(
            vorbis_version,
            audio_channels,
            audio_sample_rate,
            bitrate_maximum,
            bitrate_nominal,
            bitrate_minimum,
            blocksize & (0xf0 >> 4),
            blocksize & 0x0f,
            framing_flag,
        );
    }

    public static is_vorbis_format(bytes: Uint8Array): boolean {
        return (
            bytes[0] == 0x01 &&
            bytes_equals(
                bytes.slice(1, 7),
                [0x76, 0x6f, 0x72, 0x62, 0x69, 0x73],
            )
        );
    }
}

export class OpusIdentification {
    constructor(
        public readonly version: number,
        public readonly channel_output_count: number,
        public readonly pre_skip: number,
        public readonly input_sample_rate: number,
        public readonly output_gain: number,
        public readonly channel_mapping_family: number,
        public readonly channel_mapping_table?: Uint8Array,
    ) {}

    public static new(bytes: Uint8Array): OpusIdentification {
        const reader = BytesReader.new(bytes);
        reader.skip(8);
        const version = reader.read_next_u8();
        const channel_output_count = reader.read_next_u8();
        const pre_skip = reader.read_next_u16(false);
        const input_sample_rate = reader.read_next_u32(false);
        const output_gain = reader.read_next_u16(false);
        const channel_mapping_family = reader.read_next_u8();
        const channel_mapping_table =
            channel_mapping_family == 0x00
                ? void 0
                : reader.read(channel_mapping_family);
        return new OpusIdentification(
            version,
            channel_output_count,
            pre_skip,
            input_sample_rate,
            output_gain,
            channel_mapping_family,
            channel_mapping_table,
        );
    }

    public static is_opus_format(bytes: Uint8Array): boolean {
        return bytes_equals(
            bytes.slice(0, 8),
            [0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73],
        );
    }
}

export class Comments {
    constructor(public readonly inner: VorbisComment) {}

    public static new(bytes: Uint8Array): Comments | undefined {
        const reader = BytesReader.new(bytes);
        const head = reader.peek(8);
        if (Comments.is_opus_format(head)) {
            reader.skip(8);
            return new Comments(VorbisComment.with_byte_reader(reader));
        }
        if (Comments.is_vorbis_format(head)) {
            reader.skip(7);
            return new Comments(VorbisComment.with_byte_reader(reader));
        }
    }

    public static is_opus_format(bytes: Uint8Array): boolean {
        return bytes_equals(
            bytes.slice(0, 8),
            [0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73],
        );
    }

    public static is_vorbis_format(bytes: Uint8Array): boolean {
        return (
            bytes[0] == 0x03 &&
            bytes_equals(
                bytes.slice(1, 7),
                [0x76, 0x6f, 0x72, 0x62, 0x69, 0x73],
            )
        );
    }
}
