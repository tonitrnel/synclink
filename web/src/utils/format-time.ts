export const formatSeconds = (seconds: number): string => {
    if (seconds === Infinity) return '--';
    // 计算小时、分钟和秒
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    // 格式化为 hh:mm:ss 格式
    const formattedTime = `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return formattedTime;
};
