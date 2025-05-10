import {
    HTMLAttributes,
    DOMAttributes,
    FC,
    memo,
    useEffect,
    useMemo,
    useState,
} from 'react';
import {
    UploadTask,
    UploadTaskStage,
    useUploadTask,
} from '../../_hooks/use-upload-tasks.ts';
import { useLingui } from '@lingui/react';
import { useMediaQuery } from '~/utils/hooks/use-media-query.ts';
import { motion, Variants } from 'framer-motion';
import { XIcon } from 'lucide-react';
import { formatBytes } from '~/utils/format-bytes.ts';
import { calculateDuration } from '~/utils/calculate-duration.ts';
import { clsx } from '~/utils/clsx.ts';

export const UploadItem: FC<
    {
        id: string;
    } & Omit<
        HTMLAttributes<HTMLDivElement>,
        keyof DOMAttributes<HTMLDivElement>
    >
> = memo(({ id, className, ...props }) => {
    const task = useUploadTask(id);
    const progress = useMemo(() => {
        if (
            [
                UploadTaskStage.SERVER_PROGRESSING,
                UploadTaskStage.COMPLETED,
            ].includes(task.stage)
        )
            return 100;
        if (
            [UploadTaskStage.FAILED, UploadTaskStage.CANCELED].includes(
                task.stage,
            )
        )
            return 0;
        return Math.min(
            Math.round(
                100 -
                    ((task.data.total - task.uploaded) / task.data.total) * 100,
            ),
            100,
        );
    }, [task.data, task.stage, task.uploaded]);
    const isMobile = useMediaQuery(useMediaQuery.MOBILE_QUERY);

    return (
        <div
            className={clsx('relative mt-4 h-[9rem] px-2', className)}
            {...props}
        >
            <motion.div
                initial={variants.initial}
                animate={variants.animate}
                exit={variants.exit}
                className="flex h-full flex-col justify-between rounded-2xl bg-gray-100 p-4"
                // onAnimationStart={task.ready}
            >
                <div className="flex h-full items-center justify-between gap-2">
                    <div className="relative box-border flex h-full flex-1 flex-col py-2">
                        <div className="mt-1 flex flex-1 justify-between">
                            <div className="flex-1">
                                <span className="font-semibold text-gray-600">
                                    {task.data.filename ?? '--'}
                                </span>
                            </div>
                            <div>
                                <button
                                    onClick={task.cancel}
                                    className="cursor-pointer"
                                >
                                    <XIcon className="h-5 w-5 stroke-gray-500 hover:stroke-gray-800" />
                                </button>
                            </div>
                        </div>
                        <StageLabel task={task} />
                        <ProgressBar stage={task.stage} progress={progress} />
                    </div>
                </div>
                <TaskMeta task={task} isMobile={isMobile} />
            </motion.div>
        </div>
    );
});

const variants = {
    initial: {
        opacity: 0,
        x: -10,
    },
    animate: {
        opacity: 1,
        x: 0,
    },
    exit: {
        opacity: 0,
        x: 10,
    },
} satisfies Variants;

const StageLabel: FC<{
    task: UploadTask;
}> = ({ task }) => {
    const i18n = useLingui();
    const stageOptions = useMemo<
        Record<
            UploadTaskStage,
            {
                text: string;
                colorClass?: string;
                showDots?: boolean;
            }
        >
    >(() => {
        return {
            [UploadTaskStage.PREPARE]: {
                text: i18n._('Preparing'),
                showDots: true,
            },
            [UploadTaskStage.HASH_CALCULATING]: {
                text: i18n._('Hash calculating:'),
            },
            [UploadTaskStage.UPLOADING]: {
                text: i18n._('In transit'),
                showDots: true,
            },
            [UploadTaskStage.SERVER_PROGRESSING]: {
                text: i18n._('Nearing complete'),
                showDots: true,
            },
            [UploadTaskStage.COMPLETED]: {
                text: i18n._('Upload successful'),
                colorClass: 'text-green-600',
            },
            [UploadTaskStage.FAILED]: { text: i18n._(''), colorClass: 'text-red-600' },
            [UploadTaskStage.CANCELED]: {
                text: i18n._('Canceled.'),
                colorClass: 'text-gray-400',
            },
        };
    }, [i18n]);
    const cfg = stageOptions[task.stage];
    // 失败态直接显示 reason
    const text =
        task.stage === UploadTaskStage.FAILED
            ? task.reason
            : cfg.text;
    return (
        <div className="flex h-5 items-center text-sm text-gray-400 italic">
            <span className={cfg.colorClass}>
                {text}
                {cfg.showDots && <span className="ani_dot">...</span>}
            </span>
            {task.stage === UploadTaskStage.HASH_CALCULATING && (
                <span className="ml-1">
                    {`${task.hash_computing_progress}% - ${formatBytes(task.hash_computing_speed)}/s`}
                </span>
            )}
        </div>
    );
};

const ProgressBar: FC<{
    stage: UploadTaskStage;
    progress: number;
}> = ({ stage, progress }) => {
    const isIndeterminate =
        stage === UploadTaskStage.PREPARE ||
        stage === UploadTaskStage.HASH_CALCULATING;

    const widthStyle = isIndeterminate ? undefined : { width: `${progress}%` };

    const barClass = isIndeterminate
        ? 'animate-progress-linear origin-left-right w-full'
        : 'max-w-full';

    return (
        <div className="bg-opacity-20 mt-1 h-1 w-full overflow-hidden bg-pink-100">
            <div
                className={`${barClass} h-full bg-pink-500`}
                style={widthStyle}
            />
        </div>
    );
};

const TaskMeta: FC<{
    task: UploadTask;
    isMobile: boolean;
}> = ({ task, isMobile }) => {
    const i18n = useLingui();
    return (
        <div className="slash-splitter flex gap-1 py-2 font-mono text-sm leading-none text-gray-500">
            <span title={i18n._('Length of data to be send')}>
                {`${i18n._('Total:')} ${formatBytes(task.data.total || 0)}`}
            </span>
            {!isMobile && (
                <span title={i18n._('Length of data sent to server')}>
                    {`${i18n._('Transferred:')} ${formatBytes(task.uploaded || 0)}`}
                </span>
            )}
            <span title={i18n._('Hash calculation speed or upload speed')}>
                {`${i18n._('Speed:')} ${formatBytes(task.upload_speed || 0)}/s`}
            </span>
            {!isMobile && (
                <Duration stage={task.stage} startAt={task.data.timestamp} />
            )}
        </div>
    );
};

const Duration: FC<{
    stage: UploadTaskStage;
    startAt: number;
}> = ({ stage, startAt }) => {
    const i18n = useLingui();
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        let timer: number | null = null;
        const SY = [
            UploadTaskStage.PREPARE,
            UploadTaskStage.HASH_CALCULATING,
            UploadTaskStage.UPLOADING,
            UploadTaskStage.SERVER_PROGRESSING,
        ];
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
        <span title={i18n._('Duration time')}>
            {i18n._('Duration:')} {calculateDuration(startAt || 0, now)}
        </span>
    );
};
