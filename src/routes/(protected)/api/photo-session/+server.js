import { json } from '@sveltejs/kit';
import QRCode from 'qrcode';
import db from '$lib/server/db.js';
import { createPhotoSession } from '$lib/server/photoSessions.js';

// Neue Smartphone-Foto-Sitzung: liefert den Link für das Handy und den QR-Code dazu
export async function POST({ locals, url }) {
    if (!locals.systemId || !locals.user) return json({ error: 'Nicht angemeldet.' }, { status: 401 });
    const limit = await db.rateLimit(`photo-session:${locals.user.id}`, 30, 60 * 60 * 1000);
    if (!limit.allowed) return json({ error: `Zu viele QR-Codes. Bitte in ${limit.retryAfterMinutes} Minute(n) erneut versuchen.` }, { status: 429 });

    const session = await createPhotoSession({ systemId: locals.systemId, userId: locals.user.id });
    // Gleiche Adresse wie im Browser des PCs, damit das Handy dieselbe Sortify-Instanz erreicht
    const link = `${url.origin}/foto/${session.token}`;
    const qr = await QRCode.toDataURL(link, { margin: 1, width: 260, errorCorrectionLevel: 'M' });
    return json({ id: session.id, link, qr, expiresAt: session.expiresAt.toISOString() });
}
