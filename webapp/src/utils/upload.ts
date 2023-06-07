import { calculateHash, calculateHashFromStream } from './calculate-hash.ts';
import { UploadManager } from '~/components/upload-manager';

const preflight = async (hash: string): Promise<boolean> => {
  return fetch(`${__ENDPOINT}/upload-preflight`, {
    method: 'HEAD',
    headers: {
      'X-Content-Sha256': hash,
    },
  }).then((res) => res.status === 409);
};

const fastPerform = async (file: File) => {
  const hash = await calculateHash(file.arrayBuffer(), 'SHA-256');
  const resourceAlreadyExists = await preflight(hash);
  if (resourceAlreadyExists) return void 0;
  const headers: Record<string, string> = {
    'x-content-sha256': hash,
  };
  if (file.name.length > 0) {
    headers['x-raw-filename'] = file.name;
  }
  await fetch(`${__ENDPOINT}/upload`, {
    method: 'POST',
    body: file,
    headers,
  }).then(async (res) => {
    const responseText = await res.text();
    if (res.status === 409) return res.headers.get('location');
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
  try {
    const hash = await calculateHashFromStream(file.stream(), {
      onSpeedChange: (speed) => manager.setLoaded(0, speed),
    });
    const setupTime = Date.now();
    const previousLoadState = {
      loaded: 0,
      time: setupTime,
    };
    const resourceAlreadyExists = await preflight(hash);
    if (resourceAlreadyExists) return manager.complete();
    const uid = await new Promise<string>((resolve, reject) => {
      xhr.upload.addEventListener('progress', (evt) => {
        if (!evt.lengthComputable) return void 0;
        const now = Date.now();
        const speed =
          ((evt.loaded - previousLoadState.loaded) /
            (now - previousLoadState.time)) *
          1000;
        previousLoadState.loaded = evt.loaded;
        previousLoadState.time = now;
        manager.setLoaded(evt.loaded, speed || 0);
      });
      xhr.addEventListener('load', () => {
        if (xhr.readyState !== 4) return void 0;
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.responseText);
        } else {
          reject(new Error(xhr.responseText));
        }
      });
      xhr.addEventListener('error', (evt) => {
        console.log(evt, xhr, xhr.status, xhr.readyState);
        reject(
          new Error(
            `code: ${xhr.status}, ${xhr.statusText}, ${xhr.responseText}`
          )
        );
      });
      xhr.open('POST', `${__ENDPOINT}/upload`, true);
      xhr.setRequestHeader('x-content-sha256', hash);
      xhr.setRequestHeader('x-raw-filename', encodeURI(file.name));
      xhr.send(file);
      manager.ready();
    });
    console.log(`upload success, ${uid}`);
    manager.setLoaded(file.size, (file.size / (Date.now() - setupTime)) * 1000);
    manager.complete();
  } catch (e) {
    console.error(e);
    manager.failed(String(e));
  }
};

export const upload = async (file: File) => {
  // 2 MB
  if (file.size < 2_097_152) {
    return fastPerform(file);
  } else {
    return slowPerform(file);
  }
};
