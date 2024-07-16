import {
  FC,
  memo,
  NamedExoticComponent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { OneShot } from '~/utils/one-shot.ts';
import { formatBytes } from '~/utils/format-bytes.ts';
import { calculateDuration } from '~/utils/calculate-duration.ts';
import { XIcon } from 'icons';
import { withProduce } from '~/utils/with-produce.ts';
import { useLatestRef, useLatestFunc, useConstant } from '@painted/shared';
import { AnimatePresence, motion } from 'framer-motion';
import './upload-manager.less';
import { useMediaQuery } from '~/utils/hooks/use-media-query.ts';

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

interface UploadManagerFC<T> extends NamedExoticComponent<T> {
  oneshot: OneShot<OneShotData, OneShotHandlerReturnValue>;
}

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

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export const UploadManager: UploadManagerFC<{
  className?: string;
  scrollToBottom(): void;
}> = memo(({ className, scrollToBottom }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tasks, setTasks] = useState<TaskState[]>(() => []);
  const tasksRef = useLatestRef(tasks);
  const scrollToBottomRef = useLatestFunc(scrollToBottom);
  const timers = useConstant(() => new Map<string, number>());
  const createManager = useMemo<(id: string) => UploadManager>(
    () => (id) =>
      ({
        apply(recipe) {
          const index = tasksRef.current.findIndex((it) => it.id == id);
          withProduce(setTasks, (draft) => {
            recipe(draft[index]);
          });
        },
        entryCompleteStage() {
          this.apply((draft) => {
            draft.stage = 'COMPLETED';
          });
          document.body.dispatchEvent(new CustomEvent('refresh-stats'));
          scrollToBottomRef();
          const timer = window.setTimeout(() => {
            const index = tasksRef.current.findIndex((it) => it.id == id);
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
      } satisfies UploadManager),
    [scrollToBottomRef, tasksRef, timers]
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
      scrollToBottomRef();
      return createManager(id);
    });
    return () => {
      UploadManager.oneshot.clearCallback();
    };
  }, [createManager, scrollToBottomRef]);
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
    [tasksRef, timers]
  );
  return (
    <div ref={containerRef} className={className}>
      <AnimatePresence>
        {tasks.map((task) => (
          <Task key={task.id} {...task} onCancel={handleCancel} />
        ))}
      </AnimatePresence>
    </div>
  );
});

const Task: FC<
  TaskState & {
    onCancel(id: string): void;
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
  }) => {
    const [now, setNow] = useState(() => Date.now());
    const progress = useMemo(() => {
      if (!data) return 0;
      if (
        (['SERVER_CLIENT_PROGRESSING', 'COMPLETED'] as TaskStage[]).includes(
          stage
        )
      )
        return 100;
      if ((['FAILED', 'CANCELED'] as TaskStage[]).includes(stage)) return 0;
      return Math.min(
        Math.round(100 - ((data.total - uploaded) / data.total) * 100),
        100
      );
    }, [data, uploaded, stage]);
    const isMobile = useMediaQuery('(max-width: 768px)');

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
          x: -10,
        }}
        className="relative mt-6 p-4 border border-solid border-palette-ocean-blue bg-[#f3f6f7] rounded-xl"
      >
        <div className="flex items-center justify-between gap-2 h-20">
          {/*<div className="flex items-center justify-center w-16 h-16 font-semibold rounded-2xl border border-solid border-gray-400 capitalize">*/}
          {/*  {data?.mimetype.split('/')[0] ?? 'Unknown'}*/}
          {/*</div>*/}
          <div className="flex relative flex-col flex-1 h-full py-2 box-border">
            <div className="flex flex-1 justify-between mt-1">
              <div className="flex-1">
                <span className="font-semibold text-gray-600">
                  {data?.filename ?? '--'}
                </span>
              </div>
              <div>
                <button onClick={() => onCancel(id)}>
                  <XIcon className="w-5 h-5 stroke-gray-500 hover:stroke-gray-800" />
                </button>
              </div>
            </div>
            <div className="w-full h-5 text-sm text-gray-400 italic flex items-center">
              {(() => {
                switch (stage) {
                  case 'PREPARE':
                    return (
                      <span>
                        Preparing
                        <span className="ani_dot">...</span>
                      </span>
                    );
                  case 'HASH_CALCULATING':
                    return (
                      <span>
                        <span>
                          Hash calculating: {hash_computing_progress}%
                        </span>
                        <span> - {formatBytes(hash_computing_speed)}/s</span>
                      </span>
                    );
                  case 'UPLOADING':
                    return (
                      <span>
                        In transit
                        <span className="ani_dot">...</span>
                      </span>
                    );
                  case 'SERVER_CLIENT_PROGRESSING':
                    return (
                      <span>
                        Nearing complete
                        <span className="ani_dot">...</span>
                      </span>
                    );
                  case 'COMPLETED':
                    return (
                      <span className="text-palette-deep-green">
                        Upload successfully
                      </span>
                    );
                  case 'FAILED':
                    return (
                      <span className="text-palette-vivid-red">{reason}</span>
                    );
                  case 'CANCELED':
                    return <span className="text-gray-400">Canceled.</span>;
                }
              })()}
            </div>
            <div className="w-full h-1 bg-palette-ocean-blue bg-opacity-20 mt-1">
              <div
                className="max-w-full w-12 bg-palette-ocean-blue h-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
        <div className="flex gap-1 py-2 font-mono text-gray-500 text-sm slash-splitter italic">
          <span title="Length of data to be send">
            Total: {formatBytes(data?.total || 0)}
          </span>
          {!isMobile && (
            <span title="Length of data seet to server">
              Transferred: {formatBytes(uploaded || 0)}
            </span>
          )}
          <span title="Hash calcation speed or upload speed">
            Speed: {formatBytes(upload_speed || 0)}/s
          </span>
          {!isMobile && (
            <span title="Duration time">
              Duration: {calculateDuration(data?.timestamp || 0, now)}
            </span>
          )}
        </div>
      </motion.div>
    );
  }
);

UploadManager.oneshot = new OneShot();
