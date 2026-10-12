import { redirect, fail } from '@sveltejs/kit';
import speakeasy from 'speakeasy';
import db from '$lib/server/db.js';
import { send2FABackupCode } from '$lib/server/email.js';
import { generateNumericCode, safeRedirect } from '$lib/server/security.js';
import { startUserSession, endPending2fa } from '$lib/server/session.js';

const MAX_2FA_ATTEMPTS = 5;

// Lädt das 2FA-Ticket (Zufalls-Token im Cookie) und den zugehörigen Nutzer
async function getPendingUser(cookies) {
    const pending = await db.getSession(cookies.get('pending2fa'), 'pending2fa');
    if (!pending) return null;
    return await db.getUserById(pending.userId.toString());
}

export async function load({ cookies }) {
    // Wenn jemand direkt hierher surft ohne vorherigen Passwort-Check, wird er weggeschickt
    const user = await getPendingUser(cookies);
    if (!user) {
        cookies.delete('pending2fa', { path: '/' });
        throw redirect(303, '/login');
    }

    // Wir prüfen, ob der User eine E-Mail hat, um das Frontend (Notfall-Button) zu steuern
    return {
        hasEmail: !!user.email
    };
}

export const actions = {
    verify: async ({ request, cookies, getClientAddress, url }) => {
        const user = await getPendingUser(cookies);
        if (!user) {
            cookies.delete('pending2fa', { path: '/' });
            return fail(401, { error: 'Sitzung abgelaufen. Bitte neu anmelden.' });
        }

        const data = await request.formData();
        const code = data.get('code')?.toString().replace(/\s/g, ''); 

        if (!code) return fail(400, { error: 'Bitte gib den Code ein.' });

        // 1. Code mit Speakeasy prüfen (Normale Authenticator App)
        let isValid = false;
        if (user.twoFactorSecret) {
            isValid = speakeasy.totp.verify({
                secret: user.twoFactorSecret,
                encoding: 'base32',
                token: code,
                window: 1
            });
        }

        // 2. Wenn App-Code falsch, prüfe ob es der E-Mail-Notfallcode ist
        if (!isValid) {
            isValid = await db.verify2FABackupCode(user._id, code);
        }

        if (!isValid) {
            // Brute-Force-Schutz: Nach 5 Fehlversuchen ist das Ticket verbrannt
            const attempts = await db.incrementSessionAttempts(cookies.get('pending2fa'));
            if (attempts >= MAX_2FA_ATTEMPTS) {
                await endPending2fa(cookies);
                return fail(429, { error: 'Zu viele Fehlversuche. Bitte melde dich erneut an.' });
            }
            return fail(400, { error: 'Ungültiger oder abgelaufener Code. Bitte versuche es erneut.' });
        }

        // --- ERFOLG! Ticket löschen und finale Session starten ---
        await endPending2fa(cookies);
        await db.deleteLoginAttempt(getClientAddress());

        const systems = await startUserSession(cookies, user);

        // Passwort-Zwang prüfen
        if (user.mustChangePassword) {
            throw redirect(303, '/profil');
        }

        const redirectTo = safeRedirect(url.searchParams.get('redirectTo'));

        if (systems.length === 1) {
            throw redirect(303, redirectTo); 
        }
        // Mehrere Lager -> Auswahl, kein Lager -> dort ein eigenes Lager anlegen
        throw redirect(303, `/select-system?redirectTo=${encodeURIComponent(redirectTo)}`);
    },

    // -------------------------------------------------------------------------
    // NOTFALL-CODE PER MAIL ANFORDERN
    // -------------------------------------------------------------------------
    requestBackup: async ({ cookies }) => {
        const user = await getPendingUser(cookies);
        if (!user) return fail(401, { error: 'Sitzung abgelaufen. Bitte neu anmelden.' });

        if (!user.email) {
            return fail(400, { error: 'Für dieses Konto ist keine E-Mail-Adresse hinterlegt.' });
        }

        const limit = await db.rateLimit(`backup:${user._id}`, 3, 15 * 60 * 1000);
        if (!limit.allowed) {
            return fail(429, { error: 'Es wurden bereits mehrere Notfall-Codes angefordert. Bitte prüfe dein Postfach.' });
        }

        // Kryptografisch sicherer 6-stelliger Notfall-Code
        const backupCode = generateNumericCode();

        try {
            await db.set2FABackupCode(user._id, backupCode);
            await send2FABackupCode(user.email, user.firstName || 'Benutzer', backupCode);
            
            return { backupSuccess: true, message: 'Ein temporärer Notfall-Code wurde an deine E-Mail gesendet.' };
        } catch (err) {
            console.error("Fehler beim Senden des Backup-Codes:", err);
            return fail(500, { error: 'Fehler beim Senden der E-Mail.' });
        }
    }
};
