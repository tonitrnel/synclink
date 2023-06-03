/**
 * Creates a function that executes an asynchronous task and returns a cleanup function.
 *
 * @param doAsyncTask - The asynchronous task to execute.
 * @returns A function that, when called, starts the asynchronous task and returns a Promise. When the task completes or is already in progress, subsequent calls to the function are ignored.
 */
export function executeAsyncTask<T extends unknown[]>(
  doAsyncTask: (...args: T) => Promise<void>
): (...args: T) => Promise<void> {
  let isAsyncInProgress = false;

  return async (...args: T): Promise<void> => {
    if (isAsyncInProgress) {
      // If an asynchronous task is already in progress, ignore the current call.
      return void 0;
    }

    isAsyncInProgress = true;

    // Execute the asynchronous task.
    try {
      await doAsyncTask(...args);
    } catch (err) {
      console.error(err);
    }
    isAsyncInProgress = false;
  };
}
