import {
    FC,
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { OneShot } from '~/utils/one-shot.ts';
import { formatBytes } from '~/utils/format-bytes.ts';
import { calculateDuration } from '~/utils/calculate-duration.ts';
import { XIcon } from 'lucide-react';
import { withProduce } from '~/utils/with-produce.ts';
import { useLatestRef, useLatestFunc, useConstant } from '@ptdgrp/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { useMediaQuery } from '~/utils/hooks/use-media-query.ts';
import { useLingui } from '@lingui/react';
import { clsx } from '~/utils/clsx';

type OneShotData = {
    filename: string;
    mimetype: string;
    abort: (reason: string) => void;
    retry: () => void;
    total: number;
    timestamp: number;
};
export type UploadManager = {
    apply(recipe: (draft: TaskState) => void): void;
    failed(reason: string): void;
    ready(): void;
    onHashCalculatingProgressChange(progress: number): void;
    onHashCalculatingSpeedChange(speed: number): void;
    setLoaded(loaded: number, speed: number): void;
    entryHashCalculatingStage(): void;
    entryCompleteStage(): void;
    entryServerProcessStage(): void;
    scrollIntoView(): void;
};
type OneShotHandlerReturnValue = UploadManager;

interface TaskState {
    id: string;
    stage: TaskStage;
    data: OneShotData;
    uploaded: number;
    upload_speed: number;
    hash_computing_progress: number;
    hash_computing_speed: number;
    reason?: string;
}

type TaskStage =
    | 'PREPARE'
    | 'HASH_CALCULATING'
    | 'UPLOADING'
    | 'SERVER_CLIENT_PROGRESSING'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELED';

const UploadManagerImpl: FC<{
    className?: string;
    scrollToBottom(): void;
}> = memo(({ className, scrollToBottom: _scrollToBottom }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [tasks, setTasks] = useState<TaskState[]>(() => []);
    const tasksRef = useLatestRef(tasks);
    const scrollToBottom = useLatestFunc(_scrollToBottom);
    const timers = useConstant(() => new Map<string, number>());
    const createManager = useMemo<(id: string) => UploadManager>(
        () => (id) =>
            ({
                apply(recipe) {
                    const index = tasksRef.current.findIndex(
                        (it) => it.id == id,
                    );
                    withProduce(setTasks, (draft) => {
                        recipe(draft[index]);
                    });
                },
                entryCompleteStage() {
                    this.apply((draft) => {
                        draft.stage = 'COMPLETED';
                    });
                    document.body.dispatchEvent(
                        new CustomEvent('refresh-stats'),
                    );
                    scrollToBottom();
                    const timer = window.setTimeout(() => {
                        const index = tasksRef.current.findIndex(
                            (it) => it.id == id,
                        );
                        if (index < 0) return void 0;
                        withProduce(setTasks, (draft) => {
                            draft.splice(index, 1);
                        });
                        timers.delete(id);
                    }, 5000);
                    timers.set(id, timer);
                },
                entryHashCalculatingStage() {
                    this.apply((draft) => {
                        draft.stage = 'HASH_CALCULATING';
                    });
                },
                ready() {
                    this.apply((draft) => {
                        draft.stage = 'UPLOADING';
                    });
                },
                failed(reason) {
                    reason = reason.trim();
                    reason = reason.replace(/^Error:?\s*/gi, '');
                    if (reason.length === 0) {
                        reason = 'Unexpected error, reason unknown.';
                    }
                    this.apply((draft) => {
                        draft.stage = 'FAILED';
                        draft.reason = reason;
                    });
                },
                setLoaded(loaded, speed) {
                    this.apply((draft) => {
                        draft.uploaded = loaded;
                        draft.upload_speed = speed;
                    });
                },
                scrollIntoView(arg?: boolean | ScrollIntoViewOptions) {
                    containerRef.current?.scrollIntoView(arg);
                },
                onHashCalculatingProgressChange(progress: number) {
                    this.apply((draft) => {
                        draft.hash_computing_progress = progress;
                    });
                },
                onHashCalculatingSpeedChange(speed: number) {
                    this.apply((draft) => {
                        draft.hash_computing_speed = speed;
                    });
                },
                entryServerProcessStage() {
                    this.apply((draft) => {
                        draft.stage = 'SERVER_CLIENT_PROGRESSING';
                    });
                },
            }) satisfies UploadManager,
        [scrollToBottom, tasksRef, timers],
    );
    useEffect(() => {
        UploadManager.oneshot.setCallback((ref) => {
            const id = Math.random().toString(36).substring(2);
            const task: TaskState = {
                id,
                data: ref,
                stage: 'PREPARE',
                uploaded: 0,
                upload_speed: 0,
                hash_computing_progress: 0,
                hash_computing_speed: 0,
            };
            withProduce(setTasks, (draft) => {
                draft.push(task);
            });
            return createManager(id);
        });
        return () => {
            UploadManager.oneshot.clearCallback();
        };
    }, [createManager]);
    const handleCancel = useCallback(
        (id: string) => {
            const index = tasksRef.current.findIndex((it) => it.id == id);
            const target = tasksRef.current[index];
            if (!target) return void 0;
            switch (target.stage) {
                case 'PREPARE':
                case 'HASH_CALCULATING':
                case 'UPLOADING': {
                    target.data.abort('cancel upload');
                    withProduce(setTasks, (draft) => {
                        draft[index].stage = 'CANCELED';
                    });
                    break;
                }
                case 'COMPLETED':
                case 'CANCELED':
                case 'FAILED': {
                    withProduce(setTasks, (draft) => {
                        draft.splice(index, 1);
                    });
                    if (timers.has(id)) window.clearTimeout(timers.get(id));
                    timers.delete(id);
                    break;
                }
            }
        },
        [tasksRef, timers],
    );
    const handleReady = useCallback(() => {
        scrollToBottom();
    }, [scrollToBottom]);
    return (
        <div ref={containerRef} className={clsx('px-1', className)}>
            <AnimatePresence>
                {tasks.map((task) => (
                    <Task
                        key={task.id}
                        {...task}
                        onCancel={handleCancel}
                        onReady={handleReady}
                    />
                ))}
            </AnimatePresence>
        </div>
    );
});

const Task: FC<
    TaskState & {
        onCancel(id: string): void;
        onReady(): void;
    }
> = memo(
    ({
        id,
        stage,
        data,
        uploaded,
        upload_speed,
        hash_computing_progress,
        hash_computing_speed,
        reason,
        onCancel,
        onReady,
    }) => {
        const i18n = useLingui();
        const [now, setNow] = useState(() => Date.now());
        const progress = useMemo(() => {
            if (!data) return 0;
            if (
                (
                    ['SERVER_CLIENT_PROGRESSING', 'COMPLETED'] as TaskStage[]
                ).includes(stage)
            )
                return 100;
            if ((['FAILED', 'CANCELED'] as TaskStage[]).includes(stage))
                return 0;
            return Math.min(
                Math.round(100 - ((data.total - uploaded) / data.total) * 100),
                100,
            );
        }, [data, uploaded, stage]);
        const isMobile = useMediaQuery(useMediaQuery.MOBILE_QUERY);

        useEffect(() => {
            let timer: number | null = null;
            const SY = [
                'PREPARE',
                'HASH_CALCULATING',
                'UPLOADING',
                'SERVER_CLIENT_PROGRESSING',
            ] as TaskStage[];
            const handler = () => {
                setNow(Date.now());
                if (timer === null || !SY.includes(stage)) return void 0;
                timer = window.setTimeout(handler);
            };
            timer = window.setTimeout(handler);
            return () => {
                if (!timer) return void 0;
                window.clearTimeout(timer);
                timer = null;
            };
        }, [stage]);
        return (
            <motion.div
                initial={{
                    opacity: 0,
                    x: -10,
                }}
                animate={{
                    opacity: 1,
                    x: 0,
                }}
                exit={{
                    opacity: 0,
                    x: 10,
                }}
                onAnimationComplete={onReady}
                className="border-palette-ocean-blue relative rounded-lg border border-solid bg-gray-100 p-4"
            >
                <div className="flex h-20 items-center justify-between gap-2">
                    <div className="relative box-border flex h-full flex-1 flex-col py-2">
                        <div className="mt-1 flex flex-1 justify-between">
                            <div className="flex-1">
                                <span className="font-semibold text-gray-600">
                                    {data?.filename ?? '--'}
                                </span>
                            </div>
                            <div>
                                <button onClick={() => onCancel(id)}>
                                    <XIcon className="h-5 w-5 stroke-gray-500 hover:stroke-gray-800" />
                                </button>
                            </div>
                        </div>
                        <div className="flex h-5 w-full items-center text-sm text-gray-400 italic">
                            {(() => {
                                switch (stage) {
                                    case 'PREPARE':
                                        return (
                                            <span>
                                                {i18n._('Preparing')}
                                                <span className="ani_dot">
                                                    ...
                                                </span>
                                            </span>
                                        );
                                    case 'HASH_CALCULATING':
                                        return (
                                            <span>
                                                <span>
                                                    {i18n._(
                                                        'Hash calculating:',
                                                    )}{' '}
                                                    {hash_computing_progress}%
                                                </span>
                                                <span>
                                                    {' '}
                                                    -{' '}
                                                    {formatBytes(
                                                        hash_computing_speed,
                                                    )}
                                                    /s
                                                </span>
                                            </span>
                                        );
                                    case 'UPLOADING':
                                        return (
                                            <span>
                                                {i18n._('In transit')}
                                                <span className="ani_dot">
                                                    ...
                                                </span>
                                            </span>
                                        );
                                    case 'SERVER_CLIENT_PROGRESSING':
                                        return (
                                            <span>
                                                {i18n._('Nearing complete')}
                                                <span className="ani_dot">
                                                    ...
                                                </span>
                                            </span>
                                        );
                                    case 'COMPLETED':
                                        return (
                                            <span className="text-green-600">
                                                {i18n._('Upload successfully')}
                                            </span>
                                        );
                                    case 'FAILED':
                                        return (
                                            <span className="text-red-600">
                                                {reason}
                                            </span>
                                        );
                                    case 'CANCELED':
                                        return (
                                            <span className="text-gray-400">
                                                {i18n._('Canceled.')}
                                            </span>
                                        );
                                }
                            })()}
                        </div>
                        <div className="bg-opacity-20 mt-1 h-1 w-full bg-blue-500">
                            <div
                                className="h-full w-12 max-w-full bg-blue-500"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                </div>
                <div className="slash-splitter slash-splitter flex gap-1 py-2 font-mono text-sm text-gray-500">
                    <span title="Length of data to be send">
                        {i18n._('Total:')} {formatBytes(data?.total || 0)}
                    </span>
                    {!isMobile && (
                        <span title={i18n._('Length of data sent to server')}>
                            {i18n._('Transferred:')}{' '}
                            {formatBytes(uploaded || 0)}
                        </span>
                    )}
                    <span
                        title={i18n._('Hash calculation speed or upload speed')}
                    >
                        {i18n._('Speed:')} {formatBytes(upload_speed || 0)}/s
                    </span>
                    {!isMobile && (
                        <span title={i18n._('Duration time')}>
                            {i18n._('Duration:')}{' '}
                            {calculateDuration(data?.timestamp || 0, now)}
                        </span>
                    )}
                </div>
            </motion.div>
        );
    },
);

export const UploadManager = UploadManagerImpl as typeof UploadManagerImpl & {
    oneshot: OneShot<OneShotData, OneShotHandlerReturnValue>;
};

UploadManager.oneshot = new OneShot();
