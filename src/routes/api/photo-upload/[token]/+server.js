import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { addPhoto } from '$lib/server/photoSessions.js';
import { MAX_PHOTO_BYTES } from '$lib/photoUpload.js';

// Upload vom Handy (öffentlich, geschützt durch den Schlüssel aus dem QR-Code).
// Body: das Foto selbst (image/jpeg, im Handy bereits verkleinert)
export async function POST({ params, request, getClientAddress }) {
    let ip = 'unknown';
    try { ip = getClientAddress(); } catch { /* lokal */ }
    const limit = await db.rateLimit(`photo-upload:${ip}`, 60, 60 * 60 * 1000);
    if (!limit.allowed) return json({ error: 'Zu viele Uploads. Bitte später erneut versuchen.' }, { status: 429 });

    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > MAX_PHOTO_BYTES) return json({ error: 'Das Foto ist zu gross.' }, { status: 413 });
    const bytes = new Uint8Array(await request.arrayBuffer());

    const result = await addPhoto(params.token, bytes);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json({ ok: true, uploaded: result.uploaded });
}
