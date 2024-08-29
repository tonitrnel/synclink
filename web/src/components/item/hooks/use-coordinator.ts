import { useCallback, useLayoutEffect, useRef } from 'react';

class UseCoordinator {
  currentBatch = new Map<string, boolean>();
  resolveAllLoaded: ((value: { isTimeout: boolean }) => void) | null = null;
  timeoutTimer: number | null = null;
  checkTimer: number | null = null;
  registerItem = (itemId: string) => {
    if (this.currentBatch.has(itemId)) return void 0;
    this.currentBatch.set(itemId, false);
  };
  markAsLoaded = (itemId: string) => {
    if (!this.currentBatch.has(itemId)) return void 0;
    if (this.currentBatch.get(itemId)) return void 0;
    this.currentBatch.set(itemId, true);
    this.checkBatchCompletion();
    // console.log(itemId, true, reason);
  };
  private checkBatchCompletion = () => {
    if (this.checkTimer) window.clearTimeout(this.checkTimer);
    this.checkTimer = window.setTimeout(() => {
      this.checkTimer = null;
      if ([...this.currentBatch.values()].some((it) => !it)) return void 0;
      if (this.resolveAllLoaded) {
        if (this.timeoutTimer) window.clearTimeout(this.timeoutTimer);
        this.resolveAllLoaded({ isTimeout: false });
        this.resolveAllLoaded = null;
      }
      this.currentBatch.clear();
    }, 0);
  };
  waitForNextBatch = (timeout = 360) => {
    return new Promise<{ isTimeout: boolean }>((resolve) => {
      this.timeoutTimer = window.setTimeout(() => {
        this.timeoutTimer = null;
        this.resolveAllLoaded = null;
        this.currentBatch.clear();
        resolve({ isTimeout: true });
      }, timeout);
      this.resolveAllLoaded = resolve;
    });
  };
}

export const loadCoordinator = new UseCoordinator();

export const useCoordinator = (id: string, loaded = false) => {
  const timerRaf = useRef<number | null>(null);
  useLayoutEffect(() => {
    loadCoordinator.registerItem(id);
  }, [id]);
  useLayoutEffect(() => {
    if (timerRaf.current) {
      window.clearTimeout(timerRaf.current);
      timerRaf.current = null;
    }
    if (!loaded) return void 0;
    // console.log('pre mark', id, true);
    timerRaf.current = window.setTimeout(() => {
      timerRaf.current = null;
      loadCoordinator.markAsLoaded(id);
    }, 16);
  }, [id, loaded]);
  return useCallback(() => {
    loadCoordinator.markAsLoaded(id);
  }, [id]);
};
