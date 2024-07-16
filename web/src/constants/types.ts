import { InferSType } from '@painted/http';
import { useGetList } from '~/endpoints';
import { FC } from 'react';

export type IEntity = InferSType<typeof useGetList, 'Response'>['data'][number];

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

export type ExtractProps<C> = C extends FC<infer P> ? P : never;
