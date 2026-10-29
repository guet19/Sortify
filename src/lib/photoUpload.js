// Fotos vom Smartphone (QR-Code beim Artikel anlegen) – gemeinsame Regeln für Browser und Server
export const PHOTO_SESSION_MINUTES = 15;
export const MAX_SESSION_PHOTOS = 8;
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;   // nach dem Verkleinern im Handy meist < 1 MB

// Bildformat an den ersten Bytes erkennen (nicht dem mitgeschickten Content-Type vertrauen)
export function sniffImageType(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
    if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
    return null;
}

// Liefert eine Fehlermeldung oder null, wenn das Foto angenommen werden kann
export function photoUploadError(bytes, uploadedSoFar) {
    if (uploadedSoFar >= MAX_SESSION_PHOTOS) return `Es können höchstens ${MAX_SESSION_PHOTOS} Fotos pro QR-Code übertragen werden.`;
    if (!bytes || bytes.length === 0) return 'Es wurde kein Foto empfangen.';
    if (bytes.length > MAX_PHOTO_BYTES) return 'Das Foto ist zu gross.';
    if (!sniffImageType(bytes)) return 'Das Format wird nicht unterstützt (JPEG, PNG oder WebP).';
    return null;
}
