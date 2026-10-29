import { describe, it, expect } from 'vitest';
import { sniffImageType, photoUploadError, MAX_SESSION_PHOTOS, MAX_PHOTO_BYTES } from '../photoUpload.js';

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([1, 2, 3, 4], [...'WEBP'].map((c) => c.charCodeAt(0))));
const html = new TextEncoder().encode('<html><script>alert(1)</script>');

describe('Fotos vom Smartphone', () => {
    it('erkennt Bildformate an den ersten Bytes', () => {
        expect(sniffImageType(jpeg)).toBe('image/jpeg');
        expect(sniffImageType(png)).toBe('image/png');
        expect(sniffImageType(webp)).toBe('image/webp');
        expect(sniffImageType(html)).toBeNull();
    });

    it('nimmt gültige Fotos an und lehnt den Rest ab', () => {
        expect(photoUploadError(jpeg, 0)).toBeNull();
        expect(photoUploadError(html, 0)).toMatch(/Format/);
        expect(photoUploadError(new Uint8Array(0), 0)).toMatch(/kein Foto/);
        expect(photoUploadError(new Uint8Array(MAX_PHOTO_BYTES + 1).fill(0xff), 0)).toMatch(/zu gross/);
        expect(photoUploadError(jpeg, MAX_SESSION_PHOTOS)).toMatch(/höchstens/);
    });
});
