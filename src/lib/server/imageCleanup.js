// KI-Bildbearbeitung über Cloudinary: Hintergrund entfernen oder Schrift entfernen.
// Ablauf: Bild in einen temporären Ordner hochladen -> Cloudinary wendet die KI-Transformation an
// -> Ergebnis als WebP an den Browser -> temporäres Bild (inkl. bearbeiteter Fassung) wieder löschen.
// Liegengebliebene temporäre Bilder findet scripts/cleanup-cloudinary.js (Ordner storify_uploads).
import { v2 as cloudinary } from 'cloudinary';
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } from '$env/static/private';

cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET });

export const TMP_FOLDER = 'storify_uploads/tmp';
// Hintergrund: e_background_removal (Freisteller, transparent -> im Browser auf Weiss gelegt)
// Schrift: e_gen_remove:prompt_text (entfernt jeden Text im Bild und füllt die Stellen auf)
export const CLEANUP_EFFECTS = { background: 'background_removal', text: 'gen_remove:prompt_text' };
export const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_RESULT_BYTES = 5 * 1024 * 1024;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanupError = (code, message, extra = {}) => Object.assign(new Error(message || code), { code, ...extra });

// Nur temporäre Bilder dieses Ablaufs dürfen nachgefragt werden
export function isTempPublicId(id) {
    return typeof id === 'string' && /^storify_uploads\/tmp\/[A-Za-z0-9_-]{6,80}$/.test(id);
}

// Signierte Adresse der bearbeiteten Fassung (funktioniert auch mit "strict transformations")
export function cleanupUrl(publicId, mode) {
    return cloudinary.url(publicId, {
        secure: true,
        sign_url: true,
        format: 'webp',
        transformation: [
            { width: 1600, height: 1600, crop: 'limit' },
            { effect: CLEANUP_EFFECTS[mode] },
            { quality: 90 }
        ]
    });
}

export async function uploadTemp(file) {
    const buffer = Buffer.from(await file.arrayBuffer());
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
            { folder: TMP_FOLDER, tags: ['sortify-tmp'], allowed_formats: ['jpg', 'jpeg', 'png', 'webp'] },
            (error, result) => (error ? reject(cleanupError('upload', error.message)) : resolve(result.public_id))
        ).end(buffer);
    });
}

export async function deleteTemp(publicId) {
    if (!isTempPublicId(publicId)) return;
    try {
        await cloudinary.uploader.destroy(publicId, { invalidate: true });
    } catch (error) {
        console.warn('Temporäres Bild konnte nicht gelöscht werden:', publicId, error?.message || error);
    }
}

// Holt das Ergebnis. Cloudinary antwortet mit 423, solange die KI noch rechnet.
// Rückgabe: { status: 'done', buffer, contentType } oder { status: 'processing' }
export async function fetchCleanupResult(publicId, mode, { waitMs = 15_000, fetchImpl = fetch } = {}) {
    const url = cleanupUrl(publicId, mode);
    const deadline = Date.now() + waitMs;
    for (;;) {
        const remaining = deadline - Date.now();
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(Math.max(3_000, Math.min(15_000, remaining))) });
        if (res.ok) {
            const buffer = Buffer.from(await res.arrayBuffer());
            if (buffer.length > MAX_RESULT_BYTES) throw cleanupError('too_large', 'Das bearbeitete Bild ist zu gross.');
            return { status: 'done', buffer, contentType: res.headers.get('content-type') || 'image/webp' };
        }
        if (res.status === 423) {
            if (deadline - Date.now() < 2_500) return { status: 'processing' };
            await sleep(1_500);
            continue;
        }
        throw cleanupError('cloudinary', res.headers.get('x-cld-error') || `HTTP ${res.status}`, { status: res.status });
    }
}

// Verständliche Meldung (die Originalmeldung von Cloudinary steht im Server-Log)
export function cleanupErrorMessage(error) {
    const reason = String(error?.message || '');
    if (error?.status === 420 || /rate limit/i.test(reason)) return 'Das Cloudinary-Limit ist erreicht. Bitte später erneut versuchen.';
    if (/not (enabled|allowed|supported)|add-?on|upgrade|plan|quota|credits/i.test(reason)) {
        return 'Diese KI-Funktion ist in deinem Cloudinary-Konto nicht verfügbar (Plan oder Kontingent prüfen).';
    }
    if (error?.code === 'upload') return 'Das Bild konnte nicht zu Cloudinary hochgeladen werden.';
    if (error?.code === 'too_large') return error.message;
    if (error?.name === 'TimeoutError') return 'Cloudinary hat zu lange gebraucht. Bitte erneut versuchen.';
    return 'Cloudinary konnte das Bild nicht bearbeiten. Bitte ein anderes Bild versuchen.';
}
