export const formatBytes = (bytes: number): string => {
  if (bytes === 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const base = 1024;
  const digitGroups = Math.floor(Math.log(bytes) / Math.log(base));

  return `${(bytes / Math.pow(base, digitGroups)).toFixed(2)} ${
    units[digitGroups]
  }`;
};
