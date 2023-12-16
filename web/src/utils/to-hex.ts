export const toHex = (bytes: ArrayBuffer) => {
  return Array.from(new Uint8Array(bytes))
    .map((it) => it.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
};
