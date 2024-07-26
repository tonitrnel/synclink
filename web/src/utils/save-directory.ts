import { TarExtractor, type TarHeader } from 'tar-binding';

export const saveDirectoryFromTarStream = async (
  stream: ReadableStream<Uint8Array>,
) => {
  if (!saveDirectoryFromTarStream.SUPPORTED)
    throw new Error('not support save directory');
  const handle = await window.showDirectoryPicker();
  const permission = await handle.requestPermission({ mode: 'readwrite' });
  if (permission !== 'granted') throw new Error('permission denied');
  const extractor = TarExtractor.create(2048);
  const reader = stream.getReader();
  const handleMap = new Map([['/', handle]]);
  let writer: FileSystemWritableFileStream | undefined = undefined;
  let header: TarHeader | undefined = undefined;
  const finishWrite = () => {
    if (!writer) return void 0;
    writer.close();
  };
  while (true) {
    const result = extractor.pull();
    let terminated = false;
    switch (result.type) {
      case 'further': {
        const { done, value } = await reader.read();
        if (done) {
          if (extractor.pullable()) {
            continue;
          } else {
            terminated = true;
          }
          break;
        }
        if (!value) continue;
        // console.log('fill data');
        extractor.push(value);
        break;
      }
      case 'header': {
        header = result.payload;
        if (header.type == 'directory') {
          // console.log(
          //   `write directory, name: "${header.name}" path: "${header.path}"`,
          // );
          const path = header.path.slice(0, -1);
          const parent = path.split('/').slice(0, -1).join('/') || '/';
          if (!handleMap.has(parent)) {
            throw new Error('missing parent directory');
          }
          const parent_handle = handleMap.get(parent)!;
          const handle = await parent_handle.getDirectoryHandle(header.name, {
            create: true,
          });
          handleMap.set(path, handle);
        } else {
          const parent = header.path.split('/').slice(0, -1).join('/') || '/';
          if (!handleMap.has(parent)) {
            throw new Error('missing parent directory');
          }
          // 关闭之前的写入器
          finishWrite();
          const parent_handle = handleMap.get(parent)!;
          const handle = await parent_handle.getFileHandle(header.name, {
            create: true,
          });
          writer = await handle.createWritable();
        }
        break;
      }
      case 'data': {
        // console.log(
        //   `write file, name: "${header?.name}" path: "${header?.path}", mtime: "${new Date(header!.mtime * 1e3).toLocaleString()}",data:`,
        //   result.payload
        // );
        await writer?.write({
          data: new File([result.payload], header!.name, {
            lastModified: header!.mtime * 1e3,
            type: 'application/octet-stream',
          }),
          type: 'write',
        });
        break;
      }
    }
    if (terminated) {
      break;
    }
  }
  finishWrite();
  reader.releaseLock();
};

const SUPPORTED =
  'showDirectoryPicker' in window &&
  (() => {
    try {
      return window.self === window.top;
    } catch {
      return false;
    }
  })();

saveDirectoryFromTarStream.SUPPORTED = SUPPORTED;
