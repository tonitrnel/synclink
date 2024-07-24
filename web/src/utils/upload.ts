import {
  calculateHashFromArrayBuffer,
  calculateHashFromDirectory,
  calculateHashFromStream,
} from './calculate-hash.ts';
import { UploadManager } from '~/components/upload-manager';
import { Logger } from '~/utils/logger.ts';
import { t } from '@lingui/macro';
import { DirEntry, FilesOrEntries } from '~/constants/types.ts';
import { calculateTarSize } from '~/utils/calculate-tarsize.ts';
import { toTarStream } from '~/utils/to-tar-stream.ts';
import { progressStream } from '~/utils/progress-stream.ts';
import { createTransmissionRateCalculator } from './transmission-rate-calculator.ts';
import dayjs from 'dayjs';

const logger = new Logger('upload');

const preflight = async (hash: string, size: number): Promise<boolean> => {
  return fetch(
    `${__ENDPOINT__}/api/upload-preflight?size=${size}&hash=${hash}`,
    {
      method: 'HEAD',
      headers: {
        'X-Content-Sha256': hash,
      },
    },
  ).then(
    (res) => res.status === 409,
    () => true,
  );
};

const buildParams = (
  caption: string | undefined,
  tags: string[] | undefined,
) => {
  const params = new URLSearchParams();
  if (caption) params.set('caption', caption);
  if (tags && tags.length > 0) params.set('tags', tags.join(','));
  return params.size > 0 ? `?${params.toString()}` : '';
};
/**
 * Fast upload
 * @param file
 */
const fastPerform = async (
  file: File,
  caption: string | undefined,
  tags: string[] | undefined,
) => {
  const hash = await calculateHashFromArrayBuffer(
    file.arrayBuffer(),
    'SHA-256',
  );
  const alreadyExists = await preflight(hash, file.size);
  if (alreadyExists) {
    throw new Error(t`resource already exists`);
  }
  const headers: Record<string, string> = {
    'x-content-sha256': hash,
  };
  if (file.name.length > 0) {
    headers['x-raw-filename'] = encodeURI(file.name);
  }
  await fetch(`${__ENDPOINT__}/api/upload${buildParams(caption, tags)}`, {
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
const slowPerform = async (
  file: File,
  caption: string | undefined,
  tags: string[] | undefined,
) => {
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
    const hash = await calculateHashFromStream(file.stream(), file.type, {
      signal: abort.signal,
      onReady: () => {
        manager.entryHashCalculatingStage();
      },
      onSpeedChange: (speed) => manager.onHashCalculatingSpeedChange(speed),
      onProgressChange(loaded: number) {
        manager.onHashCalculatingProgressChange(
          Math.floor((loaded / file.size) * 100),
        );
      },
    });
    const setupTime = Date.now();
    const alreadyExists = await preflight(hash, file.size);
    if (alreadyExists) {
      manager.entryCompleteStage();
      throw new Error(t`resource already exists`);
    }
    // 100 MB
    const uid = await (file.size > 104_857_600 ? uploadByParts : uploadByWhole)(
      file,
      {
        hash,
        setupTime,
        signal: abort.signal,
        chunkSize: 104_857_600,
        manager,
        caption,
        tags,
        onReady: () => manager.ready(),
        onProgress: (loaded, speed) => manager.setLoaded(loaded, speed),
        onAllSent: () => {
          manager.entryServerProcessStage();
        },
      },
    );
    logger.debug(`upload success, ${uid}`);
    manager.setLoaded(file.size, (file.size / (Date.now() - setupTime)) * 1000);
    manager.entryCompleteStage();
  } catch (e) {
    logger.error(e);
    manager.failed(String(e));
  }
};
const dirPerform = async (
  entries: readonly DirEntry[],
  caption: string | undefined,
  tags: string[] | undefined,
) => {
  if (entries.length == 0) throw new Error('Must exists one entry');
  const abort = new AbortController();
  const size = calculateTarSize(entries);
  const filename = entries.length > 0 ? `collection_${dayjs().format("YYYY-MM-DD")}` :entries[0].name;
  const mimetype = 'application/x-tar';
  const setupTime = Date.now();
  const manager = await UploadManager.oneshot.fire({
    filename,
    mimetype,
    abort: (reason) => abort.abort(reason),
    timestamp: Date.now(),
    total: size,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    retry: () => {},
  });
  const hash = await calculateHashFromDirectory(entries, {
    signal: abort.signal,
    onReady: () => {
      manager.entryHashCalculatingStage();
    },
    onSpeedChange: (speed) => manager.onHashCalculatingSpeedChange(speed),
    onProgressChange(loaded: number) {
      manager.onHashCalculatingProgressChange(
        Math.floor((loaded / size) * 100),
      );
    },
  });
  if (await preflight(hash, size)) {
    throw new Error(t`directory already exists`);
  }
  // const headers: Record<string, string> = {
  //   'x-content-sha256': hash,
  //   'Content-Type': 'application/x-tar',
  //   'x-raw-filename': entries[0].name,
  // };
  let progress = 0;
  const stream = toTarStream(entries).pipeThrough(
    progressStream({
      onProgress(loaded: number) {
        const _progress = Math.floor((loaded / size) * 10000) / 100;
        if (_progress > progress + 4) {
          progress = _progress;
          console.log('progress', progress);
        }
      },
    }),
  );
  const blob = await new Response(stream).blob();
  const file = new File([blob], filename, {
    type: mimetype,
  });
  // 100 MB
  try {
    const uid = await (file.size > 104_857_600 ? uploadByParts : uploadByWhole)(
      file,
      {
        hash,
        setupTime,
        signal: abort.signal,
        chunkSize: 104_857_600,
        manager,
        caption,
        tags,
        onReady: () => manager.ready(),
        onProgress: (loaded, speed) => manager.setLoaded(loaded, speed),
        onAllSent: () => {
          manager.entryServerProcessStage();
        },
      },
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
    caption?: string;
    tags?: string[];
    hash: string;
    setupTime: number;
    signal: AbortSignal;
    manager: UploadManager;
    onReady(): void;
    onProgress(loaded: number, speed: number): void;
  },
): Promise<string> => {
  const xhr = new XMLHttpRequest();
  options.signal.throwIfAborted();
  options.signal.addEventListener('abort', xhr.abort);
  const q = new URLSearchParams(
    [
      ['tags', options.tags?.join(',')],
      ['caption', options.caption],
    ].filter((it): it is [string, string] => it[1] !== undefined),
  );
  const transmissionRate = createTransmissionRateCalculator();
  return new Promise<string>((resolve, reject) => {
    xhr.upload.addEventListener('progress', (evt) => {
      if (!evt.lengthComputable) return void 0;
      options.onProgress(evt.loaded, transmissionRate(evt.loaded));
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
          `code: ${xhr.status}, ${xhr.statusText}, ${xhr.responseText}`,
        ),
      );
    });
    xhr.open(
      'POST',
      `${__ENDPOINT__}/api/upload${q.size > 0 ? '?' + q.toString() : ''}`,
      true,
    );
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
    caption?: string;
    tags?: string[];
    setupTime: number;
    signal: AbortSignal;
    chunkSize: number;
    manager: UploadManager;
    onReady(): void;
    onProgress(loaded: number, speed: number): void;
    onAllSent(): void;
  },
): Promise<string> => {
  // console.log('Pre-allocating...');
  const [uid, start] = await fetch(
    `${__ENDPOINT__}/api/upload-part/allocate?size=${file.size}`,
    {
      method: 'POST',
      headers: {
        'x-content-sha256': options.hash,
      },
    },
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
    await fetch(`${__ENDPOINT__}/api/upload-part/abort?id=${uid}`, {
      method: 'DELETE',
    }).catch(console.error);
  });
  const transmissionRate = createTransmissionRateCalculator();
  const send = async (start: number) => {
    const end = start + options.chunkSize;
    const chunk = file.slice(start, end);

    const xhr = new XMLHttpRequest();
    await new Promise((resolve, reject) => {
      xhr.upload.addEventListener('progress', (evt) => {
        if (!evt.lengthComputable) return void 0;
        const transmitted = start + evt.loaded;
        options.onProgress(transmitted, transmissionRate(transmitted));
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
            `code: ${xhr.status}, ${xhr.statusText}, ${xhr.responseText}`,
          ),
        );
      });
      xhr.open(
        'PUT',
        `${__ENDPOINT__}/api/upload-part/${uid}?pos=${start}`,
        true,
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
  const q = new URLSearchParams(
    [
      ['id', uid],
      ['tags', options.tags?.join(',')],
      ['caption', options.caption],
    ].filter((it): it is [string, string] => it[1] !== undefined),
  );
  await fetch(`${__ENDPOINT__}/api/upload-part/concatenate?${q}`, {
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

export const upload = async (
  fileOrEntries: FilesOrEntries,
  caption?: string | undefined,
  tags?: string[] | undefined,
) => {
  if (fileOrEntries.type == 'multi-file') {
    if (fileOrEntries.files.length == 1) {
      const file = fileOrEntries.files[0];
      // 2 MB
      if (file.size < 2_097_152 && file.type !== 'application/x-tar') {
        return fastPerform(file, caption, tags);
      } else {
        return slowPerform(file, caption, tags);
      }
    } else {
      const entries = fileOrEntries.files.map<DirEntry>((it) => ({
        name: it.name,
        path: it.name,
        type: 'file',
        file: it,
        mtime: it.lastModified,
      }));
      return dirPerform(entries, caption, tags);
    }
  } else if (fileOrEntries.type == 'dir-entries') {
    return dirPerform(fileOrEntries.entries, caption, tags);
  }
};
