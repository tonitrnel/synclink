export const createTransmissionRateCalculator = (startTime = Date.now()) => {
    let previousRate = 0;
  
    return (currentTransmittedBytes: number): number => {
      const currentTime = Date.now();
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
  