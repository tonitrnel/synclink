import {
  memo,
  NamedExoticComponent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Spin } from '../spin';
import { OneShot } from '~/utils/one-shot.ts';
import { formatBytes } from '~/utils/format-bytes.ts';
import { calculateDuration } from '~/utils/calculate-duration.ts';
import { ReactComponent as AlertTriangleIcon } from '~/assets/alert-triangle.svg';
import { clsx } from '~/utils/clsx.ts';
import './upload-manager.css';

type OneShotData = {
  abort: (reason: string) => void;
  retry: () => void;
  total: number;
  timestamp: number;
};
type UploadManager = {
  complete(): void;
  failed(reason: string): void;
  ready(): void;
  setLoaded(loaded: number, speed: number): void;
};
type OneShotHandlerReturnValue = UploadManager;

interface UploadManagerFC<T> extends NamedExoticComponent<T> {
  oneshot: OneShot<OneShotData, OneShotHandlerReturnValue>;
}

type FileUploadStatus =
  | {
      status: 'pending' | 'uploading' | 'success';
    }
  | {
      status: 'failure';
      reason: string;
    };

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export const UploadManager: UploadManagerFC<{
  className?: string;
}> = memo(({ className }) => {
  const [uploadState, setUploadState] = useState<FileUploadStatus>(() => ({
    status: 'pending',
  }));
  const [data, setData] = useState<OneShotData | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const progress = useMemo(() => {
    if (!data) return 0;
    if (uploadState.status === 'success') return 100;
    if (uploadState.status === 'failure') return 0;
    return Math.min(
      Math.round(100 - ((data.total - loaded) / data.total) * 100),
      100
    );
  }, [data, loaded, uploadState.status]);
  const manager = useMemo<UploadManager>(
    () => ({
      complete() {
        setUploadState({ status: 'success' });
        setTimeout(() => {
          setData(null);
        }, 1000);
      },
      ready() {
        setUploadState({ status: 'uploading' });
        // setTimeout(() => {
        //   setData(null);
        // }, 3000);
      },
      failed(reason) {
        reason = reason.trim();
        reason = reason.replace(/^Error:?\s*/gi, '');
        if (reason.length === 0) {
          reason = 'Unexpected error, reason unknown.';
        }
        setUploadState({ status: 'failure', reason });
      },
      setLoaded(loaded, speed) {
        setLoaded(loaded);
        setSpeed(speed);
      },
    }),
    []
  );
  const cancelHandler = useCallback(() => {
    if (!data) return void 0;
    data.abort('Actively cancel');
    setData(null);
  }, [data]);
  const closeHandler = useCallback(() => {
    setData(null);
  }, []);
  const retryHandler = useCallback(() => {
    if (!data) return void 0;
    console.log('todo');
  }, [data]);
  useEffect(() => {
    UploadManager.oneshot.setCallback((ref) => {
      setUploadState({ status: 'pending' });
      setData(ref);
      setLoaded(0);
      setSpeed(0);
      return manager;
    });
    return () => {
      UploadManager.oneshot.clearCallback();
    };
  }, [manager]);
  useEffect(() => {
    let timer: number | null = null;
    const handler = () => {
      setNow(Date.now());
      if (
        timer === null ||
        (uploadState.status !== 'pending' && uploadState.status !== 'uploading')
      )
        return void 0;
      timer = window.setTimeout(handler);
    };
    timer = window.setTimeout(handler);
    return () => {
      if (!timer) return void 0;
      window.clearTimeout(timer);
      timer = null;
    };
  }, [uploadState.status]);
  if (!data) return null;
  return (
    <li className={clsx('upload-manager', className)}>
      <label
        htmlFor="file"
        className="upload-label"
        data-colortype={uploadState.status}
      >
        {(() => {
          switch (uploadState.status) {
            case 'pending':
              return (
                <>
                  <span>PENDING</span>
                  <Spin />
                </>
              );
            case 'uploading':
              return (
                <>
                  <span>UPLOADING</span>
                  <Spin />
                </>
              );
            case 'success':
              return (
                <>
                  <span>UPLOAD COMPLETED</span>
                </>
              );
            case 'failure':
              return (
                <>
                  <span>UPLOAD FAILED</span>
                </>
              );
          }
        })()}
      </label>
      {(() => {
        switch (uploadState.status) {
          case 'failure':
            return (
              <p className="upload-failure-reason">
                <AlertTriangleIcon />
                <span>{uploadState.reason}</span>
              </p>
            );
          case 'success':
          case 'pending':
          case 'uploading':
            return (
              <div
                id="file"
                className="upload-progress"
                data-colortype={uploadState.status}
              >
                <div
                  className="upload-progress-bar"
                  style={{ width: `${progress}%` }}
                />
              </div>
            );
        }
      })()}
      <div className="upload-details">
        <span title="Length of data to be send">
          Total: {formatBytes(data.total)}
        </span>
        <span title="Length of data seet to server">
          Transferred: {formatBytes(loaded)}
        </span>
        <span title="Hash calcation speed or upload speed">
          Speed: {formatBytes(speed)}/s
        </span>
        <span title="Duration time">
          Duration: {calculateDuration(data.timestamp, now)}
        </span>
      </div>
      <div className="upload-actions">
        {(() => {
          switch (uploadState.status) {
            case 'pending':
            case 'uploading':
              return (
                <>
                  <button title="Cancel upload" onClick={cancelHandler}>
                    Cancel
                  </button>
                </>
              );
            case 'failure':
              return (
                <>
                  <button title="Retry upload" disabled onClick={retryHandler}>
                    Retry
                  </button>
                  <button title="Close upload manager" onClick={closeHandler}>
                    Close
                  </button>
                </>
              );
            case 'success':
              return (
                <>
                  <button title="Close upload manager" onClick={closeHandler}>
                    Close
                  </button>
                </>
              );
          }
        })()}
      </div>
    </li>
  );
});

UploadManager.oneshot = new OneShot();
