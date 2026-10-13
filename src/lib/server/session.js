import db from '$lib/server/db.js';

const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 1 Woche
const PENDING_2FA_MAX_AGE = 60 * 5;       // 5 Minuten

export const cookieOptions = (maxAge) => ({
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge
});

// Echte Session starten: Zufalls-Token ins Cookie, Hash in die DB
// device: { userAgent, ip } für die Geräteliste im Profil
export async function startUserSession(cookies, user, device = {}) {
    const { token, tokenHash } = await db.createSession(user._id.toString(), 'session', SESSION_MAX_AGE, device);

    // Session Log (Fallback auf Username, falls keine Mail existiert)
    await db.createSessionLog(tokenHash, user._id, user.email || user.username);

    cookies.set('session', token, cookieOptions(SESSION_MAX_AGE));

    // Bei genau einem Lager das System direkt setzen
    const systems = user.systems || [];
    if (systems.length === 1) {
        cookies.set('systemId', systems[0].systemId.toString(), cookieOptions(SESSION_MAX_AGE));
    }
    return systems;
}

// Temporäres 2FA-Ticket: Passwort war korrekt, Code steht noch aus
export async function startPending2fa(cookies, user) {
    const { token } = await db.createSession(user._id.toString(), 'pending2fa', PENDING_2FA_MAX_AGE);
    cookies.set('pending2fa', token, cookieOptions(PENDING_2FA_MAX_AGE));
}

export async function endPending2fa(cookies) {
    await db.deleteSession(cookies.get('pending2fa'));
    cookies.delete('pending2fa', { path: '/' });
}
