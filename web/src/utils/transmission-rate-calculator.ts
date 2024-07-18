export const createTransmissionRateCalculator = (startTime = Date.now()) => {
  let previousRate = 0;

  return (currentTransmittedBytes: number, currentTime = Date.now()): number => {
    const elapsedTime = currentTime - startTime;

    // 如果时间间隔为零，直接返回之前的速率
    if (elapsedTime === 0) {
      return previousRate;
    }

    // 计算当前速率（每秒传输的字节数）
    const currentRate = (currentTransmittedBytes / elapsedTime) * 1000;

    // 平滑速率的计算
    const smoothedRate = (currentRate + previousRate) / 2;
    previousRate = smoothedRate;

    return smoothedRate;
  };
};

export const createRemainingTimeCalculator = (
  totalBytes: number,
  startTime = Date.now(),
) => {
  return (transmittedBytes: number, currentTime = Date.now()): number => {
    const elapsedTime = currentTime - startTime;

    if (elapsedTime === 0) {
      return Infinity;
    }

    const remainingBytes = totalBytes - transmittedBytes;
    const remainingTimeInSeconds = Math.floor(
      remainingBytes / ((transmittedBytes / elapsedTime) * 1000),
    );

    return remainingTimeInSeconds;
  };
};
