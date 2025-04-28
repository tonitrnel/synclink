import { DirEntry, FilesOrEntries } from '~/constants/types.ts';
import { useCallback, useMemo, useState } from 'react';
import { useLatestRef } from '@ptdgrp/shared';
import { useStatsQuery } from '~/endpoints';
import { withProduce } from '~/utils/with-produce.ts';
import { TreeNode } from '~/components/ui/tree';
import { formatBytes } from '~/utils/format-bytes.ts';
import dayjs from 'dayjs';

export interface RecordData {
    name: string;
    size: string;
    lastModified: string;
    __raw: DirEntry;
}

export interface State {
    entries: DirEntry[];
    tags: string[];
    caption: string;
}

export type Stat = {
    key: string;
    color: string;
    value: number;
    size: string;
};
export type FormValue = {
    entries: FilesOrEntries;
    tags: string[];
    caption: string;
};
export const useFileUploadLogic = ({
    mode,
    filesOrEntries,
}: {
    mode: 'file' | 'directory';
    filesOrEntries: FilesOrEntries;
}) => {
    const [state, setState] = useState<State>(() => {
        const entries =
            filesOrEntries.type === 'multi-file'
                ? mode === 'directory'
                    ? scanFiles(filesOrEntries.files)
                    : filesOrEntries.files.map<DirEntry>((it) => ({
                          name: it.name,
                          path: '',
                          type: 'file',
                          file: it,
                          mtime: it.lastModified,
                      }))
                : filesOrEntries.entries;
        return {
            entries: entries as DirEntry[],
            tags: [],
            caption: '',
        };
    });
    const stateRef = useLatestRef(state);
    const { data } = useStatsQuery({
        keepDirtyOnPending: true,
        cache: {
            key: 'stats',
        },
    });
    const buildFormValue = useCallback((): FormValue => {
        const state = stateRef.current;
        return {
            tags: [
                ...new Set(
                    state.tags
                        .map((it) => it.trim())
                        .filter((it) => it.length > 0),
                ),
            ],
            caption: state.caption.trim(),
            entries:
                mode == 'directory'
                    ? {
                          type: 'dir-entries',
                          entries: state.entries,
                      }
                    : {
                          type: 'multi-file',
                          files: (
                              state.entries as Exclude<
                                  DirEntry,
                                  { type: 'directory' }
                              >[]
                          ).map((it) => it.file),
                      },
        };
    }, [mode, stateRef]);
    const handlers = useMemo(
        () => ({
            changeTags: (tags: string[]) => {
                withProduce(setState, (draft) => {
                    draft.tags = [...tags];
                });
            },
            changeCaption: (caption: string) => {
                withProduce(setState, (draft) => {
                    draft.caption = caption;
                });
            },
        }),
        [],
    );
    const { nodes, fileCount, dirCount, total } = useMemo(() => {
        let fileCount = 0;
        let dirCount = 0;
        let total = 0;
        const nodes = dirEntryToTree(
            state.entries,
            (it): TreeNode<RecordData> => {
                if (it.type == 'directory') dirCount += 1;
                else {
                    fileCount += 1;
                    total += it.file.size;
                }
                return {
                    id: it.path + it.name,
                    data: {
                        name: it.name,
                        size:
                            it.type == 'file' ? formatBytes(it.file.size) : '-',
                        lastModified: dayjs(it.mtime).format('DD/MM/YYYY'),
                        __raw: it,
                    } satisfies RecordData,
                    leaf: it.type == 'file',
                };
            },
        );
        return {
            nodes,
            fileCount,
            dirCount,
            total,
        };
    }, [state.entries]);
    const stats = useMemo<Stat[] | undefined>(() => {
        if (!data) return void 0;
        const reservedSpacePct =
            Math.floor((data.default_reserved / data.storage_quota) * 10000) /
            100;
        const usedSpacePct = Math.min(
            100 - reservedSpacePct,
            Math.floor((data.disk_usage / data.storage_quota) * 10000) / 100,
        );
        const plannedSpacePct = Math.min(
            Math.ceil(100 - reservedSpacePct - usedSpacePct),
            Math.floor((total / data.storage_quota) * 10000) / 100,
        );
        const freeSpace = Math.max(
            0,
            data.storage_quota -
                data.default_reserved -
                data.disk_usage -
                total,
        );
        const freeSpacePct =
            Math.floor((freeSpace / data.storage_quota) * 10000) / 100;
        return [
            {
                key: 'reservedSpace',
                color: '#52525b',
                value: reservedSpacePct,
                size: formatBytes(data.default_reserved),
            },
            {
                key: 'usedSpace',
                color: '#52525b',
                value: usedSpacePct,
                size: formatBytes(data.disk_usage),
            },
            {
                key: 'plannedSpace',
                color: '#2563eb',
                value: plannedSpacePct,
                size: formatBytes(total),
            },
            {
                key: 'freeSpace',
                color:
                    freeSpacePct < 10
                        ? '#dc2626'
                        : freeSpacePct < 25
                          ? '#ea580c'
                          : '#16a34a',
                value: freeSpacePct,
                size: formatBytes(freeSpace),
            },
        ];
    }, [data, total]);
    const isLack = useMemo(() => {
        if (!data) return true;
        return (
            total >
                data.storage_quota - data.default_reserved - data.disk_usage ||
            state.entries.length == 0
        );
    }, [data, state.entries.length, total]);
    return {
        state,
        nodes,
        fileCount,
        dirCount,
        total,
        isLack,
        stats,
        buildFormValue,
        handlers,
    } as const;
};

type SettledDirEntry = Exclude<DirEntry, { type: 'file' }>;

const scanFiles = (items: readonly File[]): DirEntry[] => {
    const dirMap = new Map<string, SettledDirEntry>([
        [
            '/',
            {
                name: '/',
                path: '/',
                type: 'directory',
                mtime: 0,
                children: [],
            },
        ],
    ]);
    const mtimeStack: Array<[entry: SettledDirEntry, mtime: number]> = [];
    const ensureDir = (parentDir: string): SettledDirEntry => {
        if (!dirMap.has(parentDir)) {
            const parts = parentDir.split('/');
            const name = parts.pop()!;
            const parent = parts.join('/') || '/';
            ensureDir(parent);
            const entry: DirEntry = {
                name,
                path: parentDir,
                type: 'directory',
                mtime: 0,
                children: [],
            };
            dirMap.set(parentDir, entry);
            (dirMap.get(parent)!.children as DirEntry[]).push(entry);
        }
        return dirMap.get(parentDir)!;
    };
    for (const item of items) {
        const dirPath =
            item.webkitRelativePath.split('/').slice(0, -1).join('/') || '/';
        if (!dirMap.has(dirPath)) {
            const parts = dirPath.split('/');
            const name = parts.pop()!;
            const parentDir = parts.join('/') || '/';
            const entry: DirEntry = {
                name,
                path: dirPath,
                type: 'directory',
                mtime: 0,
                children: [],
            };
            dirMap.set(dirPath, entry);
            const children = ensureDir(parentDir).children as DirEntry[];
            children.push(entry);
        }
        const parent = dirMap.get(dirPath)!;
        const children = parent.children as DirEntry[];
        children.push({
            name: item.name,
            path: item.webkitRelativePath,
            type: 'file',
            file: item,
            mtime: item.lastModified,
        });
        mtimeStack.push([parent, item.lastModified]);
    }
    const entries = dirMap.get('/')!.children as DirEntry[];
    while (mtimeStack.length > 0) {
        const [entry, mtime] = mtimeStack.pop()!;
        if (mtime <= entry.mtime) {
            continue;
        }
        Reflect.set(entry, 'mtime', mtime);
        const parentPath = entry.path.split('/').slice(0, -1).join('/');
        const parent = parentPath ? dirMap.get(parentPath) : undefined;
        if (parent) {
            mtimeStack.unshift([parent, mtime]);
        }
    }
    return entries;
};

const dirEntryToTree = <T>(
    entries: readonly DirEntry[],
    mapper: (item: DirEntry) => TreeNode<T>,
): TreeNode<T>[] => {
    const stack: DirEntry[] = [...entries];
    const map = new Map<string, TreeNode<T>>([
        [
            '/',
            { id: 'root', children: [], data: undefined as T } as TreeNode<T>,
        ],
    ]);
    while (stack.length > 0) {
        const entry = stack.shift()!;
        const path = entry.path.split('/').slice(0, -1).join('/') || '/';
        const parent = map.get(path)!;
        if (!parent.children) {
            parent.children = [];
        }
        if (entry.type == 'file') {
            parent.children.push(mapper(entry));
        } else {
            const obj = mapper(entry);
            map.set(entry.path, obj);
            parent.children.push(obj);
            stack.push(...entry.children);
        }
    }
    return map.get('/')?.children ?? [];
};
