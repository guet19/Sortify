import { describe, it, expect, vi } from 'vitest';

vi.mock('$env/static/private', () => ({ CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret' }));
const { cleanupUrl, isTempPublicId, fetchCleanupResult, cleanupErrorMessage } = await import('../imageCleanup.js');

const response = (status, body = '', headers = {}) => new Response(status === 200 ? body : null, { status, headers });

describe('KI-Bildbearbeitung (Cloudinary)', () => {
    it('baut signierte Adressen mit der passenden KI-Transformation', () => {
        const bg = cleanupUrl('storify_uploads/tmp/abc123', 'background');
        const text = cleanupUrl('storify_uploads/tmp/abc123', 'text');
        expect(bg).toMatch(/^https:\/\/res\.cloudinary\.com\/demo\/image\/upload\/s--[^/]+--\//);
        expect(bg).toContain('c_limit,h_1600,w_1600/e_background_removal/q_90');
        expect(text).toContain('e_gen_remove:prompt_text');
        expect(bg).toMatch(/\.webp(\?|$)/);
    });

    it('lässt nur temporäre Bilder dieses Ablaufs zu', () => {
        expect(isTempPublicId('storify_uploads/tmp/k3j4h5g6f7')).toBe(true);
        expect(isTempPublicId('storify_uploads/artikelbild')).toBe(false);
        expect(isTempPublicId('storify_uploads/tmp/../geheim')).toBe(false);
        expect(isTempPublicId(undefined)).toBe(false);
    });

    it('wartet, solange Cloudinary noch rechnet (423), und liefert dann das Bild', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(response(423))
            .mockResolvedValueOnce(response(200, 'BILD', { 'content-type': 'image/webp' }));
        const result = await fetchCleanupResult('storify_uploads/tmp/abc123', 'background', { waitMs: 10_000, fetchImpl });
        expect(result.status).toBe('done');
        expect(result.buffer.toString()).toBe('BILD');
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('meldet "noch in Arbeit", wenn die Wartezeit abläuft', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(response(423));
        expect((await fetchCleanupResult('storify_uploads/tmp/abc123', 'text', { waitMs: 1_000, fetchImpl })).status).toBe('processing');
    });

    it('übersetzt Fehler von Cloudinary in verständliche Meldungen', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(response(400, '', { 'x-cld-error': 'Generative AI is not enabled for this account' }));
        const error = await fetchCleanupResult('storify_uploads/tmp/abc123', 'text', { fetchImpl }).catch((e) => e);
        expect(cleanupErrorMessage(error)).toMatch(/nicht verfügbar/);
        expect(cleanupErrorMessage(Object.assign(new Error('x'), { status: 420 }))).toMatch(/Limit/);
    });
});
