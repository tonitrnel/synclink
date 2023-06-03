export class OneShot<T, R = unknown> {
  private fired: boolean;
  private callback?: (data: T) => R;

  constructor() {
    this.fired = false;
  }

  public setCallback(callback: (data: T) => R) {
    if (this.fired) {
      throw new Error('OneShot callback has already been fired.');
    }

    this.callback = callback;
  }

  public clearCallback() {
    this.callback = void 0;
  }

  public fire(data: T): R {
    if (this.fired) {
      throw new Error('OneShot callback has already been fired.');
    }
    if (!this.callback) {
      throw new Error('OneShot callback is not set.');
    }
    this.fired = true;
    try {
      return this.callback(data);
    } finally {
      this.fired = false;
    }
  }
}
