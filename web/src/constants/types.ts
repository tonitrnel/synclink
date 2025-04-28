import { FC } from 'react';

export type DirEntry =
    | {
          readonly name: string;
          readonly path: string;
          readonly type: 'directory';
          readonly children: readonly DirEntry[];
          readonly mtime: number;
      }
    | {
          readonly name: string;
          readonly path: string;
          readonly type: 'file';
          readonly file: File;
          readonly mtime: number;
      };
export type FilesOrEntries =
    | {
          readonly type: 'multi-file';
          readonly files: readonly File[];
      }
    | {
          readonly type: 'dir-entries';
          readonly entries: readonly DirEntry[];
      };
export type ExtractProps<C> = C extends FC<infer P> ? P : never;
