const wait = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

let input: HTMLInputElement | null = null;

interface LikeFileArray extends Array<File> {
  reason: 'change' | 'cancel';
}

export const openFilePicker = (
  accept: string[],
  multiple = false,
  directory = false,
) => {
  return new Promise<LikeFileArray>((resolve) => {
    if (input) {
      input.type = '';
      input.value = '';
      document.body.removeChild(input);
    }
    let inputIsAttached = false;
    let userIsConfirmed = false; // Chrome 选择文件夹时会二次确认是否上传
    const addInputToBody = () => {
      if (!input) throw new Error('input element lost unexpectedly');
      document.body.appendChild(input);
      inputIsAttached = true;
    };
    const delInputFromBody = () => {
      inputIsAttached = false;
      if (input) {
        document.body.removeChild(input);
        input = null;
      }
    };
    input = document.createElement('input');
    input.type = 'file';
    input.accept = accept.join(',');
    input.style.display = 'none';
    input.multiple = multiple;
    if (directory) input.webkitdirectory = true;
    const cancelDetector = async () => {
      // console.log('cancelDetector');
      // onChange 触发比聚焦慢，这取决于浏览器对选择文件的处理速度
      await wait(500);
      if (!inputIsAttached) return void 0;
      if (directory && !userIsConfirmed) {
        userIsConfirmed = true;
        window.addEventListener('focus', cancelDetector);
        window.addEventListener('touchend', cancelDetector);
        window.addEventListener('mousemove', cancelDetector);
        return void 0;
      }
      // console.log('onCancel', element?.files);
      const result = [] as unknown as LikeFileArray;
      result.reason = 'cancel';
      resolve(result);
      delInputFromBody();
      window.removeEventListener('focus', cancelDetector);
      window.removeEventListener('touchend', cancelDetector);
      window.removeEventListener('mousemove', cancelDetector);
    };
    input.addEventListener('change', (evt) => {
      // console.log('onChange');
      window.removeEventListener('focus', cancelDetector);
      window.removeEventListener('touchend', cancelDetector);
      window.removeEventListener('mousemove', cancelDetector);
      const result = [
        ...((evt.target as HTMLInputElement).files ?? []),
      ] as LikeFileArray;
      result.reason = 'change';
      resolve(result);
      delInputFromBody();
    })
    addInputToBody();
    window.addEventListener('focus', cancelDetector);
    window.addEventListener('touchend', cancelDetector);
    if ('showPicker' in HTMLInputElement.prototype) {
      input.showPicker();
    } else {
      input.click();
    }
  });
};
