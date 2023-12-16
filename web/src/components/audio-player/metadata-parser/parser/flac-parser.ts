import { bytes_equals, BytesReader, RemoteReader } from '../reader';
import { VorbisComment } from './vorbis-comment.ts';

const FLAC_SIGNATURE = [0x66, 0x4c, 0x61, 0x43];
type FlacParsedBlock = Block | Comments | Picture | StreamInfo;

export class FlacParser {
  constructor(public readonly blocks: ReadonlyArray<FlacParsedBlock>) {}

  public static async new(reader: RemoteReader): Promise<FlacParser> {
    if (!(await FlacParser.is(reader))) {
      throw new Error('Invalid flac audio format.');
    }
    reader.skip(4);
    const blocks: FlacParsedBlock[] = [];
    while (!reader.is_end()) {
      const block = await Block.new(reader);
      if (StreamInfo.is_stream_info(block)) {
        blocks.push(StreamInfo.new(block));
      } else if (Picture.is_picture(block)) {
        blocks.push(Picture.new(block));
      } else if (Comments.is_comment(block)) {
        blocks.push(Comments.new(block));
      } else {
        blocks.push(block);
      }
      if (block.is_last) break;
    }
    return new FlacParser(blocks);
  }

  public static async is(reader: RemoteReader): Promise<boolean> {
    return reader.peek(4).then((bytes) => bytes_equals(bytes, FLAC_SIGNATURE));
  }
}

export class Block {
  constructor(
    public readonly id: number,
    public readonly is_last: boolean,
    public readonly len: number,
    public readonly data: Uint8Array
  ) {}

  public static async new(reader: RemoteReader): Promise<Block> {
    const [is_last, id] = await (async () => {
      const is_last = await reader.peek(1).then((bytes) => bytes[0] >> 7 == 1);
      if (is_last) {
        return [true, await reader.read_next_u8().then((num) => num & 0x0f)];
      } else {
        return [false, await reader.read_next_u8()];
      }
    })();
    const len = await (async () => {
      const [a, b, c] = await reader.read(3);
      return (a << 16) | (b << 8) | c;
    })();
    return new Block(id, is_last, len, await reader.read(len));
  }
}

export class StreamInfo {
  constructor(
    public readonly minimum_block_size: number,
    public readonly maximum_block_size: number,
    public readonly minimum_frame_size: number,
    public readonly maximum_frame_size: number,
    public readonly sample_rate: number,
    public readonly channels: number,
    public readonly bits_per_sample: number,
    public readonly total_samples: number,
    public readonly md5: string
  ) {}

  public static new(block: Block): StreamInfo {
    const reader = new BytesReader(block.data);
    const minimum_block_size = reader.read_next_u16(true);
    const maximum_block_size = reader.read_next_u16(true);
    const [minimum_frame_size, maximum_frame_size] = (() => {
      const buf = reader.read(6);
      return [
        (buf[0] << 16) | (buf[1] << 8) | buf[2],
        (buf[3] << 16) | (buf[4] << 8) | buf[5],
      ];
    })();
    const [sample_rate, channels, bits_per_sample, total_samples] = (() => {
      const buf = reader.read(8);
      const sample_rate = (buf[0] << 12) | (buf[1] << 4) | (buf[2] >> 4);
      const channels = ((buf[2] & 0x0e) >> 1) + 1;
      const bits_per_sample = (((buf[2] & 0x01) << 4) | (buf[3] >> 4)) + 1;
      // noinspection ShiftOutOfRangeJS
      const total_samples =
        ((buf[3] & 0x0f) << 32) |
        (buf[4] << 24) |
        (buf[5] << 16) |
        (buf[6] << 8) |
        buf[7];
      return [sample_rate, channels, bits_per_sample, total_samples];
    })();
    const md5 = Array.from(reader.read(16))
      .map((it) => it.toString(16).padStart(2, '0'))
      .join('');
    return new StreamInfo(
      minimum_block_size,
      maximum_block_size,
      minimum_frame_size,
      maximum_frame_size,
      sample_rate,
      channels,
      bits_per_sample,
      total_samples,
      md5
    );
  }

  public static is_stream_info(block: Block) {
    return block.id == 0x00;
  }
}

export class Picture {
  object_url: string | void = void 0;

  constructor(
    public readonly type: number,
    public readonly mime: string,
    public readonly desc: string,
    public readonly len: number,
    public readonly width: number,
    public readonly height: number,
    public readonly color_depth: number,
    public readonly indexed_color: number,
    public readonly data: Uint8Array
  ) {}

  public static new(block: Block): Picture {
    const reader = BytesReader.new(block.data);
    const type = reader.read_next_u32(true);
    const mime_len = reader.read_next_u32(true);
    const mime = reader.read_string(mime_len);
    const desc_len = reader.read_next_u32(true);
    const desc = reader.read_string(desc_len);
    const width = reader.read_next_u32(true);
    const height = reader.read_next_u32(true);
    const color_depth = reader.read_next_u32(true);
    const indexed_color = reader.read_next_u32(true);
    const len = reader.read_next_u32(true);
    const data = reader.read_remaining();
    return new Picture(
      type,
      mime,
      desc,
      len,
      width,
      height,
      color_depth,
      indexed_color,
      data
    );
  }

  public static is_picture(block: Block): boolean {
    return block.id == 0x06;
  }

  public get_url(): string {
    if (!this.object_url) {
      this.object_url = URL.createObjectURL(
        new Blob([this.data], { type: this.mime || 'image/png' })
      );
    }
    return this.object_url;
  }

  public revoke_url() {
    if (!this.object_url) return void 0;
    URL.revokeObjectURL(this.object_url);
    this.object_url = void 0;
  }
}

export class Comments {
  constructor(public readonly inner: VorbisComment) {}

  public static new(block: Block): Comments {
    return new Comments(VorbisComment.new(block.data));
  }

  public static is_comment(block: Block): boolean {
    return block.id == 0x04;
  }
}
