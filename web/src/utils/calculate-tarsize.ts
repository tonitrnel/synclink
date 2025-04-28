import { DirEntry } from '~/constants/types.ts';

const utf8_strlen = (str: string): number => {
    let len = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        if (char < 0x80) {
            len += 1;
        } else if (char < 0x800) {
            len += 2;
        } else if (char < 0x10000) {
            len += 3;
        } else {
            len += 4;
        }
    }
    return len;
};

const round512 = (v: number): number => {
    const remaining = 512 - (v % 512);
    return remaining < 512 ? v + remaining : v;
};

export const calculateTarSize = (entries: readonly DirEntry[]): number => {
    const stack = [...entries];
    let size = 0;
    while (stack.length > 0) {
        const entry = stack.pop()!;
        const strlen = utf8_strlen(entry.path);
        if (entry.type === 'directory') {
            // 路径超过 100bytes，需要单独存储路径，因此会多出 512 + pad512(strlen) 的开销
            if (strlen > 100) {
                size += 1024 + round512(strlen + 1); // header, + 1 to be compliant with GNU tar
            } else {
                size += 512; // header
            }
            stack.push(...entry.children);
        } else {
            if (strlen > 100) {
                size += 1024 + round512(strlen + 1) + round512(entry.file.size);
            } else {
                size += 512 + round512(entry.file.size);
            }
        }
    }
    return size + 1024; // 2x512 空白填充，表示 Tar 结束
};
