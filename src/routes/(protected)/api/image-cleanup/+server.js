import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import {
    CLEANUP_EFFECTS, MAX_SOURCE_BYTES, uploadTemp, deleteTemp, fetchCleanupResult, cleanupErrorMessage, isTempPublicId
} from '$lib/server/imageCleanup.js';

// KI-Bildbearbeitung im Artikel-Editor: Hintergrund oder Schrift entfernen (Cloudinary).
// POST (multipart: mode, file) -> Bild (WebP) oder 202 { status: 'processing', job }
// GET  ?job=…&mode=…         -> Nachfragen, bis Cloudinary fertig ist

function imageResponse(result) {
    return new Response(result.buffer, {
        headers: { 'content-type': result.contentType, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
    });
}

async function deliver(publicId, mode, waitMs) {
    try {
        const result = await fetchCleanupResult(publicId, mode, { waitMs });
        if (result.status === 'processing') return json({ status: 'processing', job: publicId }, { status: 202 });
        await deleteTemp(publicId);
        return imageResponse(result);
    } catch (error) {
        console.error('KI-Bildbearbeitung (Cloudinary) fehlgeschlagen:', error?.message || error);
        await deleteTemp(publicId);
        return json({ error: cleanupErrorMessage(error) }, { status: 502 });
    }
}

export async function POST({ request, locals }) {
    if (!locals.systemId || !locals.user) return json({ error: 'Nicht angemeldet.' }, { status: 401 });

    // Schont das Cloudinary-Kontingent
    const limit = await db.rateLimit(`image-cleanup:${locals.user.id}`, 40, 60 * 60 * 1000);
    if (!limit.allowed) return json({ error: `Zu viele Bildbearbeitungen. Bitte in ${limit.retryAfterMinutes} Minute(n) erneut versuchen.` }, { status: 429 });

    const data = await request.formData();
    const mode = data.get('mode')?.toString();
    const file = data.get('file');
    if (!CLEANUP_EFFECTS[mode]) return json({ error: 'Unbekannte Bearbeitung.' }, { status: 400 });
    if (!(file instanceof Blob) || file.size === 0 || file.size > MAX_SOURCE_BYTES || !String(file.type).startsWith('image/')) {
        return json({ error: 'Das Bild ist zu gross oder hat kein gültiges Format.' }, { status: 400 });
    }

    let publicId;
    try {
        publicId = await uploadTemp(file);
    } catch (error) {
        console.error('Temporärer Upload zu Cloudinary fehlgeschlagen:', error?.message || error);
        return json({ error: cleanupErrorMessage(error) }, { status: 502 });
    }
    return deliver(publicId, mode, 15_000);
}

export async function GET({ url, locals }) {
    if (!locals.systemId || !locals.user) return json({ error: 'Nicht angemeldet.' }, { status: 401 });
    const job = url.searchParams.get('job');
    const mode = url.searchParams.get('mode');
    if (!isTempPublicId(job) || !CLEANUP_EFFECTS[mode]) return json({ error: 'Ungültige Anfrage.' }, { status: 400 });
    return deliver(job, mode, 8_000);
}
