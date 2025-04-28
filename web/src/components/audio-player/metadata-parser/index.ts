// TypeScript version of https://github.com/tonitrnel/audio-metadata-parser
import { RemoteReader } from './reader';
import { ID3Parser, FlacParser, OggParser } from './parser';
import {
    Text as ID3Text,
    AttachedPicture as ID3Picture,
} from './parser/id3-parser.ts';
import {
    Comments as FlacComments,
    Picture as FlacPicture,
} from './parser/flac-parser.ts';
import { Comments as OggComments } from './parser/ogg-parser.ts';

export interface ImageValue {
    data: ArrayBuffer;
    description: string;
    mime: string;
}

export interface Metadata {
    title?: string;
    artist?: string;
    album?: string;
    image?: ImageValue;
}

export const metadataParser = async (
    url: string,
): Promise<Metadata | undefined> => {
    const bytes = new RemoteReader(url);
    await bytes.init();
    if (await ID3Parser.is(bytes)) {
        const parser = await ID3Parser.new(bytes);
        const text = new Map(
            parser.tags
                .filter((it): it is ID3Text => it instanceof ID3Text)
                .map((it) => it.inner),
        );
        const picture = parser.tags.find(
            (it): it is ID3Picture => it instanceof ID3Picture,
        );
        return {
            title: text.get('TIT2') || '',
            artist: text.get('TPE1') || '',
            album: text.get('TALB'),
            image: picture
                ? {
                      data: picture.data,
                      description: picture.description,
                      mime: picture.mime,
                  }
                : void 0,
        };
    } else if (await FlacParser.is(bytes)) {
        const parser = await FlacParser.new(bytes);
        const comments = parser.blocks
            .find((it): it is FlacComments => it instanceof FlacComments)
            ?.inner.to_map();
        const picture = parser.blocks.find(
            (it): it is FlacPicture => it instanceof FlacPicture,
        );
        if (!comments && !picture) return void 0;
        return {
            title: comments?.get('TITLE'),
            artist: comments?.get('ARTIST'),
            album: comments?.get('ALBUM'),
            image: picture
                ? {
                      data: picture.data,
                      description: picture.desc,
                      mime: picture.mime,
                  }
                : void 0,
        };
    } else if (await OggParser.is(bytes)) {
        const parser = await OggParser.new(bytes);
        const comments = parser.pages
            .find((it): it is OggComments => it instanceof OggComments)
            ?.inner.to_map();
        if (!comments) return void 0;
        return {
            title: comments.get('TITLE'),
            artist: comments.get('ARTIST'),
            album: comments.get('ALBUM'),
            image: void 0,
        };
    } else {
        console.log('Unknown audio format.', bytes);
    }
};
