import { DirEntry } from '~/constants/types.ts';
import { TarBinding } from 'tar-binding';
import * as tarWasm from 'tar-binding/tar_binding_bg.wasm';

type TarGenerator = AsyncGenerator<Uint8Array, undefined, undefined>;

async function* generator(entries: readonly DirEntry[]): TarGenerator {
    // 常见 512 bytes 的就可以了，但是如果路径超过 100 bytes 则要占用 512 * 3 bytes, 每个中文占用 3 bytes，2048 bytes 应该可以存在 340 字符
    const tar = TarBinding.create(2048);
    const wasm_buffer = new Uint8Array(tarWasm.memory.buffer);
    const ptr = tar.as_ptr();
    const stack = [...entries.toReversed()];
    const buf = new Uint8Array(512);
    while (stack.length > 0) {
        const entry = stack.pop()!;
        if (entry.type == 'directory') {
            // header
            const len = tar.append_dir_header(
                entry.path,
                (entry.mtime / 1000) | 0,
            );
            yield wasm_buffer.slice(ptr, ptr + len);
            // push
            stack.push(...entry.children.toReversed());
        } else {
            // header
            const len = tar.append_file_header(
                entry.path,
                entry.file.size,
                (entry.mtime / 1000) | 0,
            );
            yield wasm_buffer.slice(ptr, ptr + len);
            const reader = entry.file.stream().getReader();
            // file data
            while (true) {
                const { done, value } = await reader.read();
                if (done || !value) break;
                yield value;
            }
            // pad 512
            const remaining = 512 - (entry.file.size % 512);
            if (remaining < 512) {
                yield buf.slice(0, remaining);
            }
        }
    }
    // end
    yield buf;
    yield buf;
}

// export interface TarStreamOptions {
// }

export const toTarStream = (
    entries: readonly DirEntry[],
    // options: TarStreamOptions = {},
): ReadableStream<Uint8Array> => {
    let tar: TarGenerator | null = null;
    return new ReadableStream<Uint8Array>({
        async start() {
            tar = generator(entries);
        },
        async pull(controller) {
            if (!tar) throw new Error('Unexpected loss of generator');
            const { done, value } = await tar.next();
            if (done) {
                controller.close();
                return void 0;
            }
            if (value) {
                controller.enqueue(value);
            }
        },
    });
};
