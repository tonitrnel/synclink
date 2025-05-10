import { useCallback, useEffect, useMemo } from 'react';
import { useConstant, useLatestRef } from '@ptdgrp/shared';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { immer } from 'zustand/middleware/immer';
import { EventBus } from '~/utils/event-bus.ts';

export const enum UploadTaskStage {
    PREPARE,
    HASH_CALCULATING,
    UPLOADING,
    SERVER_PROGRESSING,
    COMPLETED,
    FAILED,
    CANCELED,
}

interface UploadTaskData {
    filename: string;
    mimetype: string;
    abort: (reason: string) => void;
    retry: () => void;
    total: number;
    timestamp: number;
}

export interface UploadTask {
    id: string;
    stage: UploadTaskStage;
    uploaded: number;
    upload_speed: number;
    hash_computing_progress: number;
    hash_computing_speed: number;
    data: UploadTaskData;
    reason?: string;
    ready: () => void;
    cancel: () => void;
}

export interface UploadHandlers {
    apply(recipe: (draft: UploadTask) => void): void;

    markFailure(reason: string): void;

    markReady(): void;

    setHashProgress(progress: number): void;

    setHashSpeed(speed: number): void;

    setLoaded(loaded: number, speed: number): void;

    enterHashingStage(): void;

    enterCompletionStage(): void;

    enterServerProcessingStage(): void;

    scrollIntoView(): void;
}

interface UploadTaskStore {
    tasks: UploadTask[];

    ids(): string[];

    setTasks: (recipe: (draft: UploadTask[]) => void) => void;

    setTask: (id: string, recipe: (draft: UploadTask) => void) => void;
    removeTask: (id: string) => boolean;

    getTask(id: string): UploadTask | undefined;
}

const useTasksStore = create<UploadTaskStore>()(
    immer(
        (set, get) =>
            ({
                tasks: [],
                ids() {
                    return get().tasks.map((it) => it.id);
                },
                setTask: (id, recipe) => {
                    set((draft) => {
                        const target = draft.tasks.find((it) => it.id === id);
                        if (!target) return;
                        recipe(target);
                    });
                },
                setTasks: (fn) => {
                    set((draft) => {
                        fn(draft.tasks);
                    });
                },
                removeTask: (id) => {
                    const idx = get().tasks.findIndex((it) => it.id === id);
                    if (idx < 0) return false;
                    set((draft) => {
                        draft.tasks.splice(idx, 1);
                    });
                },
                getTask: (id: string): UploadTask | undefined => {
                    return get().tasks.find((it) => it.id === id) || undefined;
                },
            }) as UploadTaskStore,
    ),
);
const bus = new EventBus<{
    create: [UploadTaskData, UploadHandlers];
}>();
export const useUploadTasks = (options: {
    scrollIntoView(index: number): void;
}) => {
    const ids = useTasksStore(useShallow((state) => state.ids()));
    const optionsRef = useLatestRef(options);
    const timersRef = useConstant(() => new Map<string, number>());
    const createManager = useCallback(
        (id: string): UploadHandlers => {
            const handlers: UploadHandlers = {
                apply(recipe) {
                    useTasksStore.getState().setTask(id, recipe);
                },
                enterCompletionStage() {
                    this.apply((draft) => {
                        draft.stage = UploadTaskStage.COMPLETED;
                    });
                    document.body.dispatchEvent(
                        new CustomEvent('refresh-stats'),
                    );
                    const timer = window.setTimeout(() => {
                        if (useTasksStore.getState().removeTask(id)) {
                            timersRef.delete(id);
                        }
                    }, 5000);
                    timersRef.set(id, timer);
                },
                enterHashingStage() {
                    handlers.apply((draft) => {
                        draft.stage = UploadTaskStage.HASH_CALCULATING;
                    });
                },
                enterServerProcessingStage() {
                    this.apply((draft) => {
                        draft.stage = UploadTaskStage.SERVER_PROGRESSING;
                    });
                },

                markReady() {
                    this.apply((draft) => {
                        draft.stage = UploadTaskStage.UPLOADING;
                    });
                },
                markFailure(reason: string) {
                    reason = reason.trim();
                    reason = reason.replace(/^Error:?\s*/gi, '');
                    if (reason.length === 0) {
                        reason = 'Unexpected error, reason unknown.';
                    }
                    this.apply((draft) => {
                        draft.stage = UploadTaskStage.FAILED;
                        draft.reason = reason;
                    });
                },
                setLoaded(loaded, speed) {
                    this.apply((draft) => {
                        draft.uploaded = loaded;
                        draft.upload_speed = speed;
                    });
                },
                setHashProgress(progress: number) {
                    this.apply((draft) => {
                        draft.hash_computing_progress = progress;
                    });
                },
                setHashSpeed(speed: number) {
                    this.apply((draft) => {
                        draft.hash_computing_speed = speed;
                    });
                },

                scrollIntoView() {
                    const index = useTasksStore.getState().ids().indexOf(id);
                    if (index < 0) return void 0;
                    optionsRef.current.scrollIntoView(index);
                },
            };
            return handlers;
        },
        [optionsRef, timersRef],
    );
    const handleCancel = useCallback(
        (id: string) => {
            const { ids, tasks, setTasks } = useTasksStore.getState();
            const index = ids().indexOf(id);
            const target = tasks[index];
            if (index < 0) return void 0;
            switch (target.stage) {
                case UploadTaskStage.PREPARE:
                case UploadTaskStage.HASH_CALCULATING:
                case UploadTaskStage.UPLOADING: {
                    target.data.abort('cancel upload');
                    setTasks((draft) => {
                        draft[index].stage = UploadTaskStage.CANCELED;
                    });
                    break;
                }
                case UploadTaskStage.COMPLETED:
                case UploadTaskStage.CANCELED:
                case UploadTaskStage.FAILED: {
                    setTasks((draft) => {
                        draft.splice(index, 1);
                    });
                    if (timersRef.has(id))
                        window.clearTimeout(timersRef.get(id));
                    timersRef.delete(id);
                    break;
                }
            }
        },
        [timersRef],
    );
    const handleReady = useCallback(
        (id: string) => {
            const index = useTasksStore.getState().ids().indexOf(id);
            if (index < 0) return void 0;
            optionsRef.current.scrollIntoView(index);
        },
        [optionsRef],
    );
    useEffect(() => {
        return bus.on('create', (data) => {
            const id = Math.random().toString(36).substring(2);
            const task: UploadTask = {
                id,
                data,
                stage: UploadTaskStage.PREPARE,
                uploaded: 0,
                upload_speed: 0,
                hash_computing_progress: 0,
                hash_computing_speed: 0,
                ready: () => handleReady(id),
                cancel: () => handleCancel(id),
            };
            useTasksStore.getState().setTasks((draft) => {
                draft.push(task);
            });
            return createManager(id);
        });
    }, [createManager, handleCancel, handleReady]);
    return ids;
};
export const useUploadTask = (id: string) => {
    const tasks = useTasksStore(useShallow((state) => state.tasks));
    const task = useMemo(() => {
        return tasks.find((it) => it.id == id);
    }, [id, tasks]);
    if (!task) {
        throw new Error(`Failed to get task '${id}'`);
    }
    return task;
};

export const createUploadTask = (data: UploadTaskData) => {
    const value = bus.emit('create', data);
    if (!value) {
        throw new Error(
            'Must use the "useUploadTask" hook within the component.',
        );
    }
    return value[0];
};

window.__debug_createUploadTask = createUploadTask;
