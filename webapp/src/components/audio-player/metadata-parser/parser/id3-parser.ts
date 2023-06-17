import { RemoteReader, BytesReader, bytes_equals } from '../reader';

const ID3_SIGNATURE = [0x49, 0x44, 0x33];
type ID3ParsedTag = Frame | AttachedPicture | Text | Comments;

export class ID3Parser {
  constructor(
    public readonly version: number,
    public readonly revision: number,
    public readonly flags: number,
    public readonly frames_size: number,
    public readonly tags: Array<Frame | AttachedPicture | Text | Comments>
  ) {}

  public static async new(reader: RemoteReader): Promise<ID3Parser> {
    if (!(await this.is(reader))) {
      throw new Error('Invalid id3 audio format');
    }
    reader.skip(3);
    const tags: Array<ID3ParsedTag> = [];
    const version = await reader.read_next_u8();
    const revision = await reader.read_next_u8();
    const flags = await reader.read_next_u8();
    // total of 28 bits
    const frames_size = await (async () => {
      const buf = await reader.read(4);
      return (buf[0] << 21) | (buf[1] << 14) | (buf[2] << 7) | buf[3];
    })();
    if (flags == 0x40) {
      reader.skip(await reader.read_next_u32(true));
    }
    let parsed_bytes = 0;
    while (
      await reader
        .peek(4)
        .then((bytes) => !bytes_equals(bytes, [0x00, 0x00, 0x00, 0x00]))
    ) {
      if (parsed_bytes == frames_size || reader.is_end()) {
        break;
      }
      const frame = await Frame.new(reader);
      if (Text.is_text(frame)) {
        tags.push(Text.new(frame));
      } else if (Comments.is_comments(frame)) {
        tags.push(Comments.new(frame));
      } else if (AttachedPicture.is_attached_picture(frame)) {
        tags.push(AttachedPicture.new(frame));
      } else {
        tags.push(frame);
      }
      parsed_bytes += 10 + frame.size;
    }
    return new ID3Parser(version, revision, flags, frames_size, tags);
  }

  public static async is(reader: RemoteReader): Promise<boolean> {
    return reader.peek(3).then((bytes) => bytes_equals(bytes, ID3_SIGNATURE));
  }
}

type Encoding = 'iso-8859-1' | 'utf-8' | 'utf-16le' | 'utf-16ge';

class Frame {
  constructor(
    public readonly id: string,
    public readonly size: number,
    public readonly flags: readonly [number, number],
    public readonly encoding: Encoding | undefined,
    public readonly data: Uint8Array
  ) {}

  public static async new(reader: RemoteReader): Promise<Frame> {
    const id = await reader.read_string(4);
    const size = (await reader.read_next_u32(true)) - 1;
    const flags = [
      await reader.read_next_u8(),
      await reader.read_next_u8(),
    ] as const;
    const encoding = await reader
      .read_next_u8()
      .then((byte): Encoding | undefined => {
        switch (byte) {
          case 0x00:
            return 'iso-8859-1';
          case 0x01:
            return 'utf-16le';
          case 0x02:
            return 'utf-16ge';
          case 0x03:
            return 'utf-8';
          default:
            return void 0;
        }
      });
    return new Frame(id, size, flags, encoding, await reader.read(size));
  }
}

export class AttachedPicture {
  constructor(
    public readonly type: number,
    public readonly mime: string,
    public readonly description: string,
    public readonly data: Uint8Array
  ) {}

  public static new(frame: Frame) {
    const reader = BytesReader.new(frame.data);
    const mime = reader.read_variant_string();
    const type = reader.read_next_u8();
    const description = reader.read_variant_string();
    return new AttachedPicture(
      type,
      mime,
      description,
      reader.read_remaining()
    );
  }

  public static is_attached_picture(frame: Frame): boolean {
    return frame.id == 'APIC';
  }
}

export class Text {
  constructor(public readonly inner: readonly [key: string, value: string]) {}

  public static new(frame: Frame): Text {
    const reader = BytesReader.new(frame.data);
    return new Text([
      frame.id.toUpperCase(),
      reader.read_string(frame.size, frame.encoding || 'utf-8'),
    ]);
  }

  public static is_text(frame: Frame): boolean {
    return frame.id.startsWith('T') && frame.id != 'TXXX';
  }
}

export class Comments {
  constructor(
    public readonly language: string,
    public readonly excerpt: string,
    public readonly content: string
  ) {}

  public static new(frame: Frame): Comments {
    const reader = BytesReader.new(frame.data);
    const language = reader.read_string(3);
    const encoding = frame.encoding || 'utf-8';
    const excerpt = reader.read_variant_string(encoding);
    const content = reader.read_variant_string(encoding);
    return new Comments(language, excerpt, content);
  }

  public static is_comments(frame: Frame): boolean {
    return frame.id == 'COMM';
  }
}
