/**
 * 下载文件
 */
export const downloadFromURL = (url: string, filename?: string) => {
    const a = document.createElement('a');
    a.style.display = 'none';
    document.body.appendChild(a);
    a.setAttribute('href', url);
    a.setAttribute('target', '_blank');
    a.setAttribute('download', filename ?? '');
    a.click();
    document.body.removeChild(a);
};

/**
 * 下载文件
 */
export const downloadFromArrayBuffer = (
    buffer: ArrayBuffer,
    fileName?: string,
) => {
    const blob = new Blob([buffer]);
    // 兼容不同浏览器的URL对象
    const url = window.URL || window.webkitURL;
    // 创建a标签并为其添加属性
    const a = document.createElement('a');
    a.href = url.createObjectURL(blob);
    a.download = fileName ?? '';
    // 触发点击事件执行下载
    a.click();
};

/**
 * 下载文件
 * @param file
 */
export const downloadFromFile = (file: File) => {
    // 兼容不同浏览器的URL对象
    const url = window.URL || window.webkitURL;
    // 创建a标签并为其添加属性
    const a = document.createElement('a');
    a.href = url.createObjectURL(file);
    a.download = file.name ?? '';
    // 触发点击事件执行下载
    a.click();
};
