import { FC, memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Spin } from '../spin';
import { OneShot } from '~/utils/one-shot.ts';
import { formatBytes } from '~/utils/format-bytes.ts';
import { calculateDuration } from '~/utils/calculate-duration.ts';
import { ReactComponent as AlertTriangleIcon } from '~/assets/alert-triangle.svg';
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
  setLoaded(loaded: number): void;
};
type OneShotHandlerReturnValue = UploadManager;

type FCWithOneShot<P = NonNullable<unknown>> = FC<P> & {
  oneshot: OneShot<OneShotData, OneShotHandlerReturnValue>;
};

type FileUploadStatus =
  | {
      status: 'pending' | 'success';
    }
  | {
      status: 'failure';
      reason: string;
    };

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export const UploadManager: FCWithOneShot = memo(() => {
  const [uploadState, setUploadState] = useState<FileUploadStatus>(() => ({
    status: 'pending',
  }));
  const [data, setData] = useState<OneShotData | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const progress = useMemo(() => {
    if (!data) return 0;
    if (uploadState.status === 'success') return 100;
    if (uploadState.status === 'failure') return 0;
    return Math.min(Math.round((loaded / data.total) * 100) / 100, 100);
  }, [data, loaded, uploadState.status]);
  const manager = useMemo<UploadManager>(
    () => ({
      complete() {
        setUploadState({ status: 'success' });
        setTimeout(() => {
          setData(null);
        }, 3000);
      },
      failed(reason) {
        reason = reason.trim();
        reason = reason.replace(/^Error:?\s*/gi, '');
        if (reason.length === 0) {
          reason = 'Unexpected error, reason unknown.';
        }
        setUploadState({ status: 'failure', reason });
      },
      setLoaded(loaded: number) {
        setLoaded(loaded);
      },
    }),
    []
  );
  const cancelHandler = useCallback(() => {
    if (!data) return void 0;
    data.abort('Actively cancel');
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
      if (timer === null || uploadState.status !== 'pending') return void 0;
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
    <li className="upload-manager">
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
        <span>Total: {formatBytes(data.total)}</span>
        <span>Transferred: {formatBytes(loaded)}</span>
        <span>Duration: {calculateDuration(data.timestamp, now)}</span>
      </div>
      <div className="upload-actions">
        {(() => {
          switch (uploadState.status) {
            case 'pending':
              return (
                <>
                  <button title="cancel upload" onClick={cancelHandler}>
                    Cancel
                  </button>
                </>
              );
            case 'failure':
              return (
                <>
                  <button title="cancel upload" onClick={retryHandler}>
                    Retry
                  </button>
                  <button title="cancel upload" onClick={closeHandler}>
                    Close
                  </button>
                </>
              );
            case 'success':
              return (
                <>
                  <button title="cancel upload" onClick={closeHandler}>
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
