const wait = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

let element: HTMLInputElement | null = null;

interface LikeFileArray extends Array<File> {
  reason: 'change' | 'cancel';
}

export const openFilePicker = (
  accept: string[],
  multiple = false,
  directory = false
) => {
  return new Promise<LikeFileArray>((resolve) => {
    if (element) {
      element.type = '';
      element.value = '';
      document.body.removeChild(element);
    }
    let inputIsAttached = false;
    let userIsConfirmed = false; // Chrome 选择文件夹时会二次确认是否上传
    const addInputToBody = () => {
      if (!element) throw new Error('input element lost unexpectedly');
      document.body.appendChild(element);
      inputIsAttached = true;
    };
    const delInputFromBody = () => {
      inputIsAttached = false;
      if (element) {
        document.body.removeChild(element);
        element = null;
      }
    };
    element = document.createElement('input');
    element.type = 'file';
    element.accept = accept.join(',');
    element.style.display = 'none';
    element.multiple = multiple;
    if (directory) element.webkitdirectory = true;
    const onCancelListener = async () => {
      await wait(500);
      if (!inputIsAttached) return void 0;
      if (directory && !userIsConfirmed) {
        userIsConfirmed = true;
        window.addEventListener('focus', onCancelListener, { once: true });
        window.addEventListener('touchend', onCancelListener, { once: true });
        window.addEventListener('mousemove', onCancelListener, { once: true });
        return void 0;
      }
      // console.log('onCancel', element?.files);
      const result = [] as unknown as LikeFileArray;
      result.reason = 'cancel';
      resolve(result);
      delInputFromBody();
      window.removeEventListener('focus', onCancelListener);
      window.removeEventListener('touchend', onCancelListener);
      window.removeEventListener('mousemove', onCancelListener);
    };
    element.onchange = (ev) => {
      // console.log('onChange');
      window.removeEventListener('focus', onCancelListener);
      window.removeEventListener('touchend', onCancelListener);
      window.removeEventListener('mousemove', onCancelListener);
      const result = [
        ...((ev.target as HTMLInputElement).files ?? []),
      ] as LikeFileArray;
      result.reason = 'change';
      resolve(result);
      delInputFromBody();
    };
    window.addEventListener('focus', onCancelListener, { once: true });
    window.addEventListener('touchend', onCancelListener, { once: true });
    addInputToBody();
    element.click();
  });
};
