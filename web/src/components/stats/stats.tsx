import { FC, useCallback, useEffect, useMemo } from 'react';
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
    cache: {
      key: 'stats'
    }
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
  const stats = useMemo(() => {
    if (!data) return undefined;
    return {
      storage_quota: formatBytes(data.storage_quota),
      disk_usage: formatBytes(data.disk_usage),
      percentage: `(${Math.floor(
        (data.disk_usage / (data.storage_quota - data.default_reserved)) * 100,
      )})%`,
      memory_usage: formatBytes(data.memory_usage),
      uptime: formatDur(data?.uptime ?? 0),
    };
  }, [data]);
  return (
    <div className={className}>
      <span title={`${stats?.disk_usage}/${stats?.storage_quota}${stats?.percentage}`}>
        disk: {stats?.disk_usage || '-'}
      </span>
      <span>mem: {stats?.memory_usage || '-'}</span>
      <span>uptime: {stats?.uptime || '-'}</span>
      <RefreshCwIcon
        onClick={refresh}
        className={clsx(
          'w-4 h-4 cursor-pointer',
          data && pending && 'animate-spin',
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
