import { json } from '@sveltejs/kit';
import { takePhoto } from '$lib/server/photoSessions.js';

// Foto abholen (wird danach gelöscht)
export async function GET({ params, locals }) {
    if (!locals.systemId || !locals.user) return json({ error: 'Nicht angemeldet.' }, { status: 401 });
    const photo = await takePhoto(params.id, params.photoId, { systemId: locals.systemId, userId: locals.user.id });
    if (!photo) return json({ error: 'Foto nicht gefunden.' }, { status: 404 });
    return new Response(photo.data, {
        headers: { 'content-type': photo.contentType, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
    });
}
