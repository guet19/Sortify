// Cloudinary-ID eines Bildes – nur für Bilder aus dem eigenen Konto und Upload-Ordner
// (externe Shop-Bilder oder fremde Konten werden nie angefasst). Auch von scripts/ genutzt.
export const UPLOAD_FOLDER = 'storify_uploads/';

export function cloudinaryPublicIdFor(url, cloudName) {
    let parsed;
    try { parsed = new URL(url); } catch { return null; }
    if (parsed.hostname !== 'res.cloudinary.com' || !cloudName) return null;

    const [, cloud, resourceType, deliveryType, ...rest] = parsed.pathname.split('/');
    if (cloud !== cloudName || resourceType !== 'image' || deliveryType !== 'upload') return null;

    const parts = rest[0] && /^v\d+$/.test(rest[0]) ? rest.slice(1) : rest; // Versionsnummer überspringen
    const publicId = decodeURIComponent(parts.join('/')).replace(/\.[a-z0-9]+$/i, '');
    return publicId.startsWith(UPLOAD_FOLDER) ? publicId : null;
}
