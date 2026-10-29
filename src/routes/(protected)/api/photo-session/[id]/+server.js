import { json } from '@sveltejs/kit';
import { getPhotoSessionStatus, closePhotoSession } from '$lib/server/photoSessions.js';

const owner = (locals) => ({ systemId: locals.systemId, userId: locals.user?.id });

// Stand der Sitzung: welche Fotos warten auf die Übernahme?
export async function GET({ params, locals }) {
    if (!locals.systemId || !locals.user) return json({ error: 'Nicht angemeldet.' }, { status: 401 });
    const status = await getPhotoSessionStatus(params.id, owner(locals));
    return status ? json(status, { headers: { 'cache-control': 'no-store' } }) : json({ status: 'expired', photos: [] }, { status: 404 });
}

// Sitzung beenden (QR-Code geschlossen): Sitzung und nicht abgeholte Fotos löschen
export async function DELETE({ params, locals }) {
    if (!locals.systemId || !locals.user) return json({ error: 'Nicht angemeldet.' }, { status: 401 });
    await closePhotoSession(params.id, owner(locals));
    return json({ ok: true });
}
