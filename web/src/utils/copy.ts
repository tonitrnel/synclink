/**
 * 复制
 * @param text
 */
export const copy = (text: string) => {
    if (!navigator.clipboard) {
        return fallback(text);
    }
    return navigator.clipboard.writeText(text);
};
/**
 * fallback
 * @param text
 */
const fallback = async (text: string) => {
    return new Promise<void>((resolve, reject) => {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.top = '0';
        el.style.left = '0';
        el.style.position = 'absolute';
        el.style.opacity = '0';
        el.style.zIndex = '-2';
        document.body.appendChild(el);
        el.focus();
        el.select();
        const successful = document.execCommand('copy');
        if (successful) {
            resolve();
        } else {
            reject(
                new Error('Fallback: Copying text command was unsuccessful'),
            );
        }
        document.body.removeChild(el);
    });
};
