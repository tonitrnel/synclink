import { AudioItem } from './audio.tsx';
import { FolderItem } from './folder.tsx';
import { ImageItem } from './image.tsx';
import { TextItem } from './text.tsx';
import { VideoItem } from './video.tsx';
import { UnknownItem } from './unknown.tsx';

export const ItemTypeComponentMap = {
    audio: AudioItem,
    folder: FolderItem,
    image: ImageItem,
    text: TextItem,
    video: VideoItem,
    unknown: UnknownItem,
} as const;
