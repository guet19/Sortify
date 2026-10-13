import { v2 as cloudinary } from 'cloudinary';
import {
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET
} from '$env/static/private';
import { safeHttpUrl } from '$lib/server/security.js';

cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET
});

export const MAX_ARTICLE_IMAGES = 8;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// Alle Bilder eines Artikels (neues Format: images[], altes Format: nur imagePath)
export function getArticleImages(article) {
    if (Array.isArray(article?.images) && article.images.length > 0) return article.images;
    return article?.imagePath ? [article.imagePath] : [];
}

async function uploadToCloudinary(file) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'storify_uploads', allowed_formats: ['jpg', 'png', 'webp'] },
            (error, uploaded) => (error ? reject(error) : resolve(uploaded))
        );
        uploadStream.end(buffer);
    });
    return result.secure_url;
}

// Baut die geordnete Bildliste aus dem Formular. Das Formular schickt:
//   imageOrder: JSON-Liste mit { type: 'file', index } | { type: 'keep', url } | { type: 'url', url }
//   imageFiles: die neu zugeschnittenen Bilder (Reihenfolge = index)
// keep: nur Bilder, die bereits zum Artikel gehören (beim Bearbeiten)
// url:  externe http(s)-Bilder (z.B. kopierter Artikel oder Bild, das sich nicht laden liess)
export async function buildImageList(formData, { allowedKeep = [], allowExternal = false } = {}) {
    let order;
    try {
        order = JSON.parse(formData.get('imageOrder') || '[]');
        if (!Array.isArray(order)) throw new Error();
    } catch {
        throw new Error('Ungültige Bilddaten.');
    }
    const files = formData.getAll('imageFiles');

    const images = [];
    for (const entry of order) {
        if (images.length >= MAX_ARTICLE_IMAGES) break;

        if (entry?.type === 'file') {
            const file = files[Number(entry.index)];
            if (!(file instanceof Blob) || file.size === 0) continue;
            if (file.size > MAX_FILE_BYTES || !String(file.type).startsWith('image/')) {
                throw new Error('Ein Bild ist zu gross oder kein gültiges Bildformat.');
            }
            images.push(await uploadToCloudinary(file));
        } else if (entry?.type === 'keep' && allowedKeep.includes(entry.url)) {
            images.push(entry.url);
        } else if (entry?.type === 'url' && allowExternal) {
            const url = safeHttpUrl(entry.url);
            if (url) images.push(url);
        }
    }
    return [...new Set(images)];
}

// ==========================================
// BILDER BEI CLOUDINARY LÖSCHEN
// ==========================================

const UPLOAD_FOLDER = 'storify_uploads/';

// Liefert die Cloudinary-ID eines Bildes – nur für Bilder aus unserem eigenen Konto und Upload-Ordner
// (externe Shop-Bilder oder fremde Konten werden nie angefasst)
export function cloudinaryPublicId(url) {
    let parsed;
    try { parsed = new URL(url); } catch { return null; }
    if (parsed.hostname !== 'res.cloudinary.com') return null;

    const [, cloud, resourceType, deliveryType, ...rest] = parsed.pathname.split('/');
    if (cloud !== CLOUDINARY_CLOUD_NAME || resourceType !== 'image' || deliveryType !== 'upload') return null;

    const parts = rest[0] && /^v\d+$/.test(rest[0]) ? rest.slice(1) : rest; // Versionsnummer überspringen
    const publicId = decodeURIComponent(parts.join('/')).replace(/\.[a-z0-9]+$/i, '');
    return publicId.startsWith(UPLOAD_FOLDER) ? publicId : null;
}

// Löscht Bilder bei Cloudinary, die von keinem Artikel mehr verwendet werden.
// isInUse(url) prüft in der DB, ob ein (anderer) Artikel das Bild noch nutzt – z.B. nach dem Kopieren.
// Fehler werden nur protokolliert: Das Löschen in Sortify soll daran nie scheitern.
export async function deleteUnusedImages(urls, isInUse) {
    const candidates = [...new Set(urls || [])];
    const publicIds = [];
    for (const url of candidates) {
        const publicId = cloudinaryPublicId(url);
        if (!publicId) continue;
        try {
            if (await isInUse(url)) continue;
            publicIds.push(publicId);
        } catch (err) {
            console.warn('Bildnutzung konnte nicht geprüft werden, Bild bleibt erhalten:', url, err.message);
        }
    }

    // Cloudinary löscht höchstens 100 Bilder pro Aufruf
    for (let i = 0; i < publicIds.length; i += 100) {
        try {
            await cloudinary.api.delete_resources(publicIds.slice(i, i + 100), { resource_type: 'image', type: 'upload' });
        } catch (err) {
            console.error('Bilder konnten bei Cloudinary nicht gelöscht werden:', err?.message || err);
        }
    }
    return publicIds.length;
}
