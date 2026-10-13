import { describe, it, expect } from 'vitest';
import { imageUrl } from '../imageUrl.js';
import { appendImagesToFormData, articleImageUrls, imageItem } from '../imageTools.js';

describe('imageUrl', () => {
    it('verkleinert Cloudinary-Bilder', () => {
        expect(imageUrl('https://res.cloudinary.com/demo/image/upload/v17/storify_uploads/a.jpg', 400))
            .toBe('https://res.cloudinary.com/demo/image/upload/c_limit,w_400,f_auto,q_auto/v17/storify_uploads/a.jpg');
    });
    it('lässt andere Bilder unverändert', () => {
        expect(imageUrl('https://shop.example/a.jpg', 400)).toBe('https://shop.example/a.jpg');
        expect(imageUrl(null, 400)).toBeNull();
    });
});

describe('Bildliste im Formular', () => {
    it('behält die Reihenfolge (erstes = Hauptbild)', () => {
        const fd = new FormData();
        appendImagesToFormData(fd, [
            imageItem('keep', { url: 'https://x/alt.jpg' }),
            imageItem('file', { blob: new Blob(['a'], { type: 'image/jpeg' }) }),
            imageItem('url', { url: 'https://shop/b.jpg' })
        ]);
        expect(JSON.parse(fd.get('imageOrder'))).toEqual([
            { type: 'keep', url: 'https://x/alt.jpg' },
            { type: 'file', index: 0 },
            { type: 'url', url: 'https://shop/b.jpg' }
        ]);
        expect(fd.getAll('imageFiles')).toHaveLength(1);
    });
    it('liest altes und neues Bildformat', () => {
        expect(articleImageUrls({ imagePath: 'a' })).toEqual(['a']);
        expect(articleImageUrls({ images: ['a', 'b'], imagePath: 'a' })).toEqual(['a', 'b']);
        expect(articleImageUrls({})).toEqual([]);
    });
});
