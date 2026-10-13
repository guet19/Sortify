import { describe, it, expect, vi, beforeEach } from 'vitest';

const deleted = [];
let uploads = 0;
vi.mock('$env/static/private', () => ({ CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' }));
vi.mock('cloudinary', () => ({
    v2: {
        config: () => {},
        api: { delete_resources: async (ids) => { deleted.push(...ids); } },
        uploader: { upload_stream: (opts, cb) => ({ end: () => cb(null, { secure_url: `https://res.cloudinary.com/demo/image/upload/storify_uploads/neu-${++uploads}.jpg` }) }) }
    }
}));

const { buildImageList, cloudinaryPublicId, deleteUnusedImages, MAX_ARTICLE_IMAGES } = await import('../articleImages.js');

const form = (order, files = []) => {
    const f = new FormData();
    f.set('imageOrder', JSON.stringify(order));
    files.forEach((b) => f.append('imageFiles', b, 'x.jpg'));
    return f;
};
const jpg = () => new Blob([new Uint8Array(10)], { type: 'image/jpeg' });

beforeEach(() => { deleted.length = 0; });

describe('buildImageList', () => {
    it('lädt neue Bilder hoch und behält die Reihenfolge', async () => {
        const result = await buildImageList(form([{ type: 'url', url: 'https://shop/a.jpg' }, { type: 'file', index: 0 }], [jpg()]), { allowExternal: true });
        expect(result[0]).toBe('https://shop/a.jpg');
        expect(result[1]).toMatch(/storify_uploads\/neu-/);
    });
    it('übernimmt beim Bearbeiten nur Bilder des Artikels', async () => {
        const own = ['https://res.cloudinary.com/demo/image/upload/storify_uploads/alt.jpg'];
        const result = await buildImageList(form([{ type: 'keep', url: 'https://evil/x.jpg' }, { type: 'url', url: 'https://evil/y.jpg' }, { type: 'keep', url: own[0] }]), { allowedKeep: own });
        expect(result).toEqual(own);
    });
    it('begrenzt auf die Höchstzahl und verwirft javascript:-Links', async () => {
        const many = Array.from({ length: 12 }, (_, i) => ({ type: 'url', url: `https://shop/${i}.jpg` }));
        expect(await buildImageList(form(many), { allowExternal: true })).toHaveLength(MAX_ARTICLE_IMAGES);
        expect(await buildImageList(form([{ type: 'url', url: 'javascript:alert(1)' }]), { allowExternal: true })).toEqual([]);
    });
    it('lehnt Nicht-Bilder ab', async () => {
        await expect(buildImageList(form([{ type: 'file', index: 0 }], [new Blob(['x'], { type: 'text/html' })]))).rejects.toThrow();
    });
});

describe('Cloudinary aufräumen', () => {
    it('erkennt nur eigene Bilder im Upload-Ordner', () => {
        expect(cloudinaryPublicId('https://res.cloudinary.com/demo/image/upload/v1/storify_uploads/a.jpg')).toBe('storify_uploads/a');
        expect(cloudinaryPublicId('https://res.cloudinary.com/fremd/image/upload/v1/storify_uploads/a.jpg')).toBeNull();
        expect(cloudinaryPublicId('https://res.cloudinary.com/demo/image/upload/v1/sample.jpg')).toBeNull();
        expect(cloudinaryPublicId('https://shop.example/a.jpg')).toBeNull();
    });
    it('löscht keine Bilder, die noch verwendet werden', async () => {
        const shared = 'https://res.cloudinary.com/demo/image/upload/storify_uploads/kopie.jpg';
        const free = 'https://res.cloudinary.com/demo/image/upload/storify_uploads/frei.jpg';
        await deleteUnusedImages([shared, free, free, 'https://shop/x.jpg'], async (u) => u === shared);
        expect(deleted).toEqual(['storify_uploads/frei']);
    });
});
