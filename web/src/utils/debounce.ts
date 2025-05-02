/**
 * Debounce a function
 * @description 在事件被触发n秒后再执行回调，如果在这n秒内又被触发，则重新计时
 * @param func
 * @param delay
 * @this null
 */
export function debounce<T extends (...args: unknown[]) => void>(
    func: T,
    delay = 500,
): DebounceReturn<T> {
    let timeout: number | null = null;
    const fn = (...args: Parameters<T>) => {
        if (timeout !== null) {
            clearTimeout(timeout);
        }
        timeout = window.setTimeout(() => {
            func(...args);
        }, delay);
    };
    Reflect.set(fn, 'cancel', () => {
        if (timeout !== null) {
            clearTimeout(timeout);
            timeout = null;
        }
    });
    return fn as DebounceReturn<T>;
}

type DebounceReturn<T extends (...args: unknown[]) => unknown> = ((...args: Parameters<T>) => void) & { cancel: () => void };