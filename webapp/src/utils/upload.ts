import { calculateHash, calculateHashFromStream } from './calculate-hash.ts';
import { UploadManager } from '~/components/upload-manager';

const fastPerform = async (file: File) => {
  const hash = await calculateHash(file.arrayBuffer(), 'SHA-256');
  const headers: Record<string, string> = {
    'x-content-sha256': hash,
  };
  if (file.name.length > 0) {
    headers['x-raw-filename'] = file.name;
  }
  await fetch(`${import.meta.env.VITE_APP_ENDPOINT}/upload`, {
    method: 'POST',
    body: file,
    headers,
  }).then(async (res) => {
    const responseText = await res.text();
    if (!res.ok) {
      throw new Error(responseText);
    }
    return responseText;
  });
};
const slowPerform = async (file: File) => {
  const xhr = new XMLHttpRequest();
  const manager = UploadManager.oneshot.fire({
    abort: () => xhr.abort(),
    timestamp: Date.now(),
    total: file.size,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    retry: () => {},
  });
  xhr.addEventListener('progress', (evt) => {
    if (!evt.lengthComputable) return void 0;
    manager.setLoaded(evt.loaded);
  });
  try {
    const hash = await calculateHashFromStream(file.stream());
    const uid = await new Promise<string>((resolve, reject) => {
      xhr.addEventListener('load', () => {
        if (xhr.readyState !== 4) return void 0;
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.responseText);
        } else {
          reject(new Error(xhr.responseText));
        }
      });
      xhr.addEventListener('error', () => {
        reject(
          new Error(
            `code: ${xhr.status}, ${xhr.statusText}, ${xhr.responseText}`
          )
        );
      });
      xhr.open('POST', `${import.meta.env.VITE_APP_ENDPOINT}/upload`, true);
      xhr.setRequestHeader('x-content-sha256', hash);
      xhr.setRequestHeader('x-raw-filename', encodeURI(file.name));
      xhr.send(file);
    });
    console.log(`upload success, ${uid}`);
    manager.setLoaded(file.size);
    manager.complete();
  } catch (e) {
    manager.failed(String(e));
  }
};

export const upload = async (file: File) => {
  if (file.size < 4096) {
    return fastPerform(file);
  } else {
    return slowPerform(file);
  }
};
