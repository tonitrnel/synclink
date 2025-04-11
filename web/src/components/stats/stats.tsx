import { FC, memo, useEffect, useMemo } from 'react';
import { formatBytes } from '~/utils/format-bytes.ts';
import { clsx } from '~/utils/clsx.ts';
import { RefreshCwIcon } from 'lucide-react';
import { useStatsQuery } from '~/endpoints';

export const Stats: FC<{
  className?: string;
}> = memo(({ className }) => {
  const { data, pending, refresh } = useStatsQuery({
    keepDirtyOnPending: true,
    cache: {
      key: 'stats',
    },
  });
  useEffect(() => {
    let lastRefreshTime = 0;

    const refreshData = () => {
      refresh().catch(console.error);
    };

    const refreshDataOnFocus = () => {
      const now = Date.now();
      if (now < lastRefreshTime + 300_000) {
        // 300,000 milliseconds = 5 minutes
        return void 0;
      }
      lastRefreshTime = now;
      refresh().catch(console.error);
    };

    window.addEventListener('focus', refreshDataOnFocus);
    document.body.addEventListener('refresh-stats', refreshData);

    return () => {
      document.body.removeEventListener('refresh-stats', refreshData);
      window.removeEventListener('focus', refreshDataOnFocus);
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
    <div className={clsx('select-none', className)}>
      <span
        title={`${stats?.disk_usage}/${stats?.storage_quota}${stats?.percentage}`}
      >
        disk: {stats?.disk_usage || '-'}
      </span>
      <span>mem: {stats?.memory_usage || '-'}</span>
      <span>uptime: {stats?.uptime || '-'}</span>
      <RefreshCwIcon
        onClick={() => refresh()}
        className={clsx(
          'h-4 w-4 cursor-pointer',
          data && pending && 'animate-spin',
        )}
      />
    </div>
  );
});

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
