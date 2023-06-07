export class OneShot<T, R = unknown> {
  private fired: boolean;
  private callback?: (data: T) => R;
  private pending?: {
    data: T;
    resolve: (value: R | PromiseLike<R>) => void;
    reject: (reason?: unknown) => void;
  };

  constructor() {
    this.fired = false;
  }

  public setCallback(callback: (data: T) => R) {
    if (this.fired) {
      throw new Error('OneShot callback has already been fired.');
    }

    this.callback = callback;
    if (this.pending) {
      this.fired = true;
      try {
        const result = callback(this.pending.data);
        this.pending.resolve(result);
      } catch (e) {
        this.pending.reject(e);
      }
      this.fired = false;
      this.pending = void 0;
    }
  }

  public clearCallback() {
    this.callback = void 0;
  }

  public async fire(data: T): Promise<R> {
    if (this.fired) {
      throw new Error('OneShot callback has already been fired.');
    }
    if (!this.callback) {
      // throw new Error('OneShot callback is not set.');
      return new Promise((resolve, reject) => {
        this.pending = { data, resolve, reject };
      });
    }
    this.fired = true;
    try {
      return this.callback(data);
    } finally {
      this.fired = false;
    }
  }
}
