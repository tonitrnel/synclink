export const formatBytes = (bytes: number): string => {
  // noinspection SuspiciousTypeOfGuard
  if (bytes <= 0 || Number.isNaN(bytes) || typeof bytes !== 'number') {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const base = 1024;
  const digitGroups = Math.floor(Math.log(bytes) / Math.log(base));

  return `${(bytes / Math.pow(base, digitGroups)).toFixed(2)} ${
    units[digitGroups]
  }`;
};
