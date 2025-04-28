const buildFingerprint = () =>
    ({
        userAgent: navigator.userAgent,
        screen: `${screen.width}x${screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        orientation: screen.orientation.type,
        pixelDepth: screen.pixelDepth,
        canvas: (() => {
            const canvas = document.createElement('canvas');
            return canvas.toDataURL();
        })(),
        webglVendor: (() => {
            const gl = document.createElement('canvas').getContext('webgl');
            if (!gl) return undefined;
            return gl.getParameter(gl.VENDOR);
        })(),
    }) satisfies Record<string, string | number | undefined>;

const FINGERPRINT_ID_REF: { value: string | undefined } = { value: undefined };

export const generateFingerprint = async (): Promise<string> => {
    if (FINGERPRINT_ID_REF.value) {
        return FINGERPRINT_ID_REF.value;
    }
    const fingerprint = buildFingerprint();
    const bytes = new TextEncoder().encode(
        [...Object.entries(fingerprint)].reduce(
            (acc, [key, value]) => acc + `${key}:${value}`,
            '',
        ),
    );
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    const fingerprintId = `fingerprint:${btoa([...new Uint8Array(digest)].map((it) => String.fromCharCode(it)).join(''))}`;
    FINGERPRINT_ID_REF.value = fingerprintId;
    return fingerprintId;
};
