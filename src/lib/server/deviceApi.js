// Gemeinsame Helfer der Geräte-API (/api/device/*)
import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';

export const deviceError = (status, error) => json({ error }, { status });

// Begrenzt Anfragen pro IP (Schutz vor Missbrauch der öffentlichen Kopplungs-Endpunkte)
export async function limitByIp(getClientAddress, name, max, windowMs) {
    let ip = 'unknown';
    try { ip = getClientAddress(); } catch { /* z.B. lokal */ }
    const { allowed, retryAfterMinutes } = await db.rateLimit(`device:${name}:${ip}`, max, windowMs);
    return allowed ? null : deviceError(429, `Zu viele Anfragen. Bitte in ${retryAfterMinutes} Minute(n) erneut versuchen.`);
}

export async function readJson(request) {
    try {
        const body = await request.json();
        return body && typeof body === 'object' ? body : {};
    } catch {
        return {};
    }
}
