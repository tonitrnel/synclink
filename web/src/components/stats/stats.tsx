import { FC, useCallback, useEffect } from 'react';
import { formatBytes } from '~/utils/format-bytes.ts';
import { clsx } from '~/utils/clsx.ts';
import { RefreshCwIcon } from 'icons';
import { useGetStats } from '~/endpoints';

export const Stats: FC<{
  className?: string;
}> = ({ className }) => {
  const {
    data,
    pending,
    refresh: _refresh,
  } = useGetStats({
    keepDirtyOnPending: true,
  });
  const refresh = useCallback(() => _refresh(), [_refresh]);
  useEffect(() => {
    window.addEventListener('focus', refresh);
    document.body.addEventListener('refresh-stats', refresh);
    return () => {
      document.body.removeEventListener('refresh-stats', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);
  return (
    <div className={className}>
      <span>disk: {formatBytes(data?.disk_usage ?? 0)}</span>
      <span>mem: {formatBytes(data?.memory_usage ?? 0)}</span>
      <span>uptime: {formatDur(data?.uptime ?? 0)}</span>
      <RefreshCwIcon
        onClick={refresh}
        className={clsx(
          'w-4 h-4 cursor-pointer',
          data && pending && 'animate-spin'
        )}
      />
    </div>
  );
};

const formatDur = (dur: number) => {
  if (dur === 0) return '0';
  if (dur > 86400) {
    return `${Math.floor(dur / 86400)}d`;
  }
  if (dur > 3600) {
    return `${Math.floor(dur / 3600)}h`;
  }
  if (dur > 60) {
    return `${Math.floor(dur / 60)}min`;
  }
  return `${dur}s`;
};
