import { calculateHash, calculateHashFromStream } from './calculate-hash.ts';
import { UploadManager } from '~/components/upload-manager';
import { Logger } from '~/utils/logger.ts';
import { t } from '@lingui/macro';

const logger = new Logger('upload');

const preflight = async (hash: string): Promise<boolean> => {
  return fetch(`${__ENDPOINT}/api/upload-preflight`, {
    method: 'HEAD',
    headers: {
      'X-Content-Sha256': hash,
    },
  }).then(
    (res) => res.status === 409,
    () => true
  );
};

/**
 * Fast upload
 * @param file
 */
const fastPerform = async (file: File) => {
  const hash = await calculateHash(file.arrayBuffer(), 'SHA-256');
  const alreadyExists = await preflight(hash);
  if (alreadyExists) {
    throw new Error(t`resource already exists`);
  }
  const headers: Record<string, string> = {
    'x-content-sha256': hash,
  };
  if (file.name.length > 0) {
    headers['x-raw-filename'] = encodeURI(file.name);
  }
  await fetch(`${__ENDPOINT}/api/upload`, {
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
  const abort = new AbortController();
  const manager = await UploadManager.oneshot.fire({
    filename: file.name,
    mimetype: file.type,
    abort: (reason) => abort.abort(reason),
    timestamp: Date.now(),
    total: file.size,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    retry: () => {},
  });
  manager.scrollIntoView();
  try {
    const hash = await calculateHashFromStream(file.stream(), {
      signal: abort.signal,
      onReady: () => {
        manager.entryHashCalculatingStage();
      },
      onSpeedChange: (speed) => manager.onHashCalculatingSpeedChange(speed),
      onProgressChange(loaded: number) {
        manager.onHashCalculatingProgressChange(
          Math.floor((loaded / file.size) * 100)
        );
      },
    });
    const setupTime = Date.now();
    const alreadyExists = await preflight(hash);
    if (alreadyExists) return manager.entryCompleteStage();
    // 100 MB
    const uid = await (file.size > 104_857_600 ? uploadByParts : uploadByWhole)(
      file,
      {
        hash,
        setupTime,
        signal: abort.signal,
        chunkSize: 104_857_600,
        manager,
        onReady: () => manager.ready(),
        onProgress: (loaded, speed) => manager.setLoaded(loaded, speed),
        onAllSent: () => {
          manager.entryServerProcessStage();
        },
      }
    );
    logger.debug(`upload success, ${uid}`);
    manager.setLoaded(file.size, (file.size / (Date.now() - setupTime)) * 1000);
    manager.entryCompleteStage();
  } catch (e) {
    logger.error(e);
    manager.failed(String(e));
  }
};

const uploadByWhole = (
  file: File,
  options: {
    hash: string;
    setupTime: number;
    signal: AbortSignal;
    manager: UploadManager;
    onReady(): void;
    onProgress(loaded: number, speed: number): void;
  }
): Promise<string> => {
  const xhr = new XMLHttpRequest();
  options.signal.throwIfAborted();
  options.signal.addEventListener('abort', xhr.abort);
  const previousLoadState = {
    loaded: 0,
    time: options.setupTime,
  };
  return new Promise<string>((resolve, reject) => {
    xhr.upload.addEventListener('progress', (evt) => {
      if (!evt.lengthComputable) return void 0;
      const now = Date.now();
      const speed =
        ((evt.loaded - previousLoadState.loaded) /
          (now - previousLoadState.time)) *
        1000;
      previousLoadState.loaded = evt.loaded;
      previousLoadState.time = now;
      options.onProgress(evt.loaded, speed || 0);
    });
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
        new Error(`code: ${xhr.status}, ${xhr.statusText}, ${xhr.responseText}`)
      );
    });
    xhr.open('POST', `${__ENDPOINT}/api/upload`, true);
    xhr.setRequestHeader('x-content-sha256', options.hash);
    xhr.setRequestHeader('x-raw-filename', encodeURI(file.name));
    xhr.send(file);
    options.onReady();
  });
};
const uploadByParts = async (
  file: File,
  options: {
    hash: string;
    setupTime: number;
    signal: AbortSignal;
    chunkSize: number;
    manager: UploadManager;
    onReady(): void;
    onProgress(loaded: number, speed: number): void;
    onAllSent(): void;
  }
): Promise<string> => {
  const previousLoadState = {
    loaded: 0,
    time: options.setupTime,
  };
  // console.log('Pre-allocating...');
  const [uid, start] = await fetch(
    `${__ENDPOINT}/api/upload-part/allocate?size=${file.size}`,
    {
      method: 'POST',
      headers: {
        'x-content-sha256': options.hash,
      },
    }
  )
    .then((res) => {
      if (res.ok) return res.text();
      else throw new Error(res.statusText);
    })
    .then((text) => {
      const [uid, start] = text.split(';');
      return [uid, Number(start)] as const;
    });
  options.onReady();
  // const totalChunks = Math.ceil(file.size / options.chunkSize);
  // let count = 1;
  options.signal.addEventListener('abort', async () => {
    await fetch(`${__ENDPOINT}/api/upload-part/abort?id=${uid}`, {
      method: 'DELETE',
    }).catch(console.error);
  });
  const send = async (start: number) => {
    const end = start + options.chunkSize;
    const chunk = file.slice(start, end);

    const xhr = new XMLHttpRequest();
    let previousSpeed = 0;
    await new Promise((resolve, reject) => {
      xhr.upload.addEventListener('progress', (evt) => {
        if (!evt.lengthComputable) return void 0;
        const now = Date.now();
        const speed =
          ((evt.loaded - previousLoadState.loaded) /
            (now - previousLoadState.time)) *
          1000;
        previousLoadState.loaded = evt.loaded;
        previousLoadState.time = now;
        previousSpeed = speed;
        options.onProgress(
          start + evt.loaded,
          (speed + previousSpeed || 2) / 2
        );
      });
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
      xhr.open(
        'PUT',
        `${__ENDPOINT}/api/upload-part/${uid}?pos=${start}`,
        true
      );
      xhr.send(chunk);
    });
    // console.log(`Sent chunk ${count}/${totalChunks}`);
    // count += 1;
    if (end < file.size) {
      await send(end);
    }
  };
  await send(start);
  // console.log('Merging...');
  options.onAllSent();
  await fetch(`${__ENDPOINT}/api/upload-part/concatenate?id=${uid}`, {
    method: 'POST',
    headers: {
      'content-type': file.type,
      'x-content-sha256': options.hash,
      'x-raw-filename': encodeURI(file.name),
    },
  }).then(async (res) => {
    if (!res.ok) throw new Error(await res.text());
  });
  return uid;
};

export const upload = async (file: File) => {
  // 2 MB
  if (file.size < 2_097_152) {
    return fastPerform(file);
  } else {
    return slowPerform(file);
  }
};
