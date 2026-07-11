import { redirect, fail } from '@sveltejs/kit';
import speakeasy from 'speakeasy';
import db from '$lib/server/db.js';
import { send2FABackupCode } from '$lib/server/email.js'; // 🔥 NEU: Import für die Notfall-Mail

export async function load({ cookies }) {
    const pendingUserId = cookies.get('pending2fa');
    // Wenn jemand direkt hierher surft ohne vorherigen Passwort-Check, wird er weggeschickt
    if (!pendingUserId) {
        throw redirect(303, '/login');
    }

    // 🔥 NEU: Wir prüfen, ob der User eine E-Mail hat, um das Frontend (Notfall-Button) zu steuern
    const user = await db.getUserById(pendingUserId);
    if (!user) {
        cookies.delete('pending2fa', { path: '/' });
        throw redirect(303, '/login');
    }

    return {
        hasEmail: !!user.email
    };
}

export const actions = {
    verify: async ({ request, cookies, getClientAddress, url }) => {
        const pendingUserId = cookies.get('pending2fa');
        if (!pendingUserId) return fail(401, { error: 'Sitzung abgelaufen. Bitte neu anmelden.' });

        const data = await request.formData();
        const code = data.get('code')?.toString().replace(/\s/g, ''); 

        if (!code) return fail(400, { error: 'Bitte gib den Code ein.' });

        // Nutzer laden
        const user = await db.getUserById(pendingUserId);
        if (!user) {
            cookies.delete('pending2fa', { path: '/' });
            throw redirect(303, '/login');
        }

        // 🔥 NEU: 1. Code mit Speakeasy prüfen (Normale Authenticator App)
        let isValid = false;
        if (user.twoFactorSecret) {
            isValid = speakeasy.totp.verify({
                secret: user.twoFactorSecret,
                encoding: 'base32',
                token: code,
                window: 1
            });
        }

        // 🔥 NEU: 2. Wenn App-Code falsch, prüfe ob es der E-Mail-Notfallcode ist
        if (!isValid) {
            isValid = await db.verify2FABackupCode(pendingUserId, code);
        }

        if (!isValid) {
            return fail(400, { error: 'Ungültiger oder abgelaufener Code. Bitte versuche es erneut.' });
        }

        // --- ERFOLG! Ticket löschen und finale Session starten ---
        cookies.delete('pending2fa', { path: '/' });
        const ip = getClientAddress();
        await db.deleteLoginAttempt(ip);

        const sessionId = user._id.toString(); 
        await db.createSessionLog(sessionId, user._id, user.email || user.username);

        cookies.set('session', sessionId, {
            path: '/', 
            httpOnly: true, 
            sameSite: 'lax', 
            secure: process.env.NODE_ENV === 'production', 
            maxAge: 60 * 60 * 24 * 7 
        });

        // Passwort-Zwang prüfen
        if (user.mustChangePassword) {
            throw redirect(303, '/force-password-change');
        }

        const redirectTo = url.searchParams.get('redirectTo') || '/';

        // Multi-System Logik kopieren
        const systems = user.systems || [];
        if (systems.length === 1) {
            cookies.set('systemId', systems[0].systemId.toString(), {
                path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 7
            });
            throw redirect(303, redirectTo); 
        } else if (systems.length > 1) {
            throw redirect(303, `/select-system?redirectTo=${encodeURIComponent(redirectTo)}`);
        } else {
            return fail(403, { error: 'Dir ist noch kein Lager zugewiesen.' });
        }
    },

    // -------------------------------------------------------------------------
    // 🔥 NEU: NOTFALL-CODE PER MAIL ANFORDERN
    // -------------------------------------------------------------------------
    requestBackup: async ({ cookies }) => {
        const pendingUserId = cookies.get('pending2fa');
        if (!pendingUserId) return fail(401, { error: 'Sitzung abgelaufen. Bitte neu anmelden.' });

        const user = await db.getUserById(pendingUserId);
        if (!user || !user.email) {
            return fail(400, { error: 'Für dieses Konto ist keine E-Mail-Adresse hinterlegt.' });
        }

        // Generiere einen zufälligen 6-stelligen Notfall-Code
        const backupCode = Math.floor(100000 + Math.random() * 900000).toString();

        try {
            await db.set2FABackupCode(pendingUserId, backupCode);
            await send2FABackupCode(user.email, user.firstName || 'Benutzer', backupCode);
            
            return { backupSuccess: true, message: 'Ein temporärer Notfall-Code wurde an deine E-Mail gesendet.' };
        } catch (err) {
            console.error("Fehler beim Senden des Backup-Codes:", err);
            return fail(500, { error: 'Fehler beim Senden der E-Mail.' });
        }
    }
};