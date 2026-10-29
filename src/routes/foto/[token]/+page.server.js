import { photoSessionFromToken } from '$lib/server/photoSessions.js';
import { MAX_SESSION_PHOTOS } from '$lib/photoUpload.js';

// Handy-Seite für Fotos (öffentlich, nur mit gültigem Schlüssel aus dem QR-Code nutzbar)
export async function load({ params }) {
    const session = await photoSessionFromToken(params.token);
    if (!session) return { valid: false };
    return {
        valid: true,
        token: params.token,
        uploaded: session.uploaded,
        max: MAX_SESSION_PHOTOS,
        expiresAt: session.expiresAt.toISOString()
    };
}
