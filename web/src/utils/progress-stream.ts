export interface ProgressStreamOptions {
    onProgress: (loaded: number) => void;
}

export const progressStream = (options: ProgressStreamOptions) => {
    let loaded = 0;
    return new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
            loaded += chunk.length;
            controller.enqueue(chunk);
            options.onProgress(loaded);
        },
    });
};
