export const calculateDuration = (
    startTime: number,
    endTime: number,
): string => {
    const durationMs = endTime - startTime;
    const durationSeconds = Math.floor(durationMs / 1000);
    const hours = Math.floor(durationSeconds / 3600);
    const minutes = Math.floor((durationSeconds % 3600) / 60);
    const seconds = durationSeconds % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};
