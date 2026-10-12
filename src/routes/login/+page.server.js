import { redirect, fail } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import db from '$lib/server/db.js';
import { sendVerificationEmail } from '$lib/server/email.js';
import { safeRedirect } from '$lib/server/security.js';
import { startUserSession, startPending2fa } from '$lib/server/session.js';

export async function load({ locals, url }) {
    if (locals.user) {
        const redirectTo = safeRedirect(url.searchParams.get('redirectTo'));
        throw redirect(303, redirectTo);
    }
}

export const actions = {
    // -------------------------------------------------------------------------
    // AKTION 1: DER NORMALE LOGIN (Jetzt mit Email ODER Username & 2FA Check)
    // -------------------------------------------------------------------------
    login: async ({ request, cookies, getClientAddress, url }) => {
        const ip = getClientAddress();
        const now = new Date();
        
        let attemptData = await db.getLoginAttempt(ip);
        if (!attemptData) {
            attemptData = { ip: ip, count: 0, lockUntil: new Date(0) };
        }

        if (attemptData.lockUntil > now) {
            const remainingMinutes = Math.ceil((attemptData.lockUntil.getTime() - now.getTime()) / 60000);
            return fail(429, { 
                error: `Zu viele Fehlversuche. Deine IP ist für ${remainingMinutes} Minute(n) gesperrt.` 
            });
        }

        const data = await request.formData();
        const identifier = data.get('identifier')?.toString().trim();
        const password = data.get('password')?.toString();

        if (!identifier || !password) {
            return fail(400, { error: 'Bitte fülle alle Felder aus.' });
        }

        const registerFailedAttempt = async () => {
            attemptData.count += 1;
            let lockTime = attemptData.lockUntil;
            
            if (attemptData.count >= 5) {
                lockTime = new Date(now.getTime() + 5 * 60 * 1000); // 5 Minuten Sperre
            }

            await db.upsertLoginAttempt(ip, attemptData.count, lockTime);

            if (attemptData.count >= 5) {
                return fail(429, { error: '5 Fehlversuche erreicht. IP für 5 Minuten gesperrt.' });
            }
            
            const attemptsLeft = 5 - attemptData.count;
            return fail(401, { error: `Benutzername/E-Mail oder Passwort falsch. Noch ${attemptsLeft} Versuch(e).` });
        };

        // Zusätzlich pro Konto begrenzen (schützt auch bei wechselnden IPs)
        const perAccount = await db.rateLimit(`login:${identifier.toLowerCase()}`, 10, 15 * 60 * 1000);
        if (!perAccount.allowed) {
            return fail(429, { error: `Zu viele Fehlversuche für dieses Konto. Bitte warte ${perAccount.retryAfterMinutes} Minute(n).` });
        }

        const user = await db.getUserByIdentifier(identifier);
        let isPasswordValid = false;

        if (user && user.password) {
            isPasswordValid = await bcrypt.compare(password, user.password);
        } else {
            // Dummy-Hash prüfen, um Timing-Angriffe zu verhindern
            await bcrypt.compare(password, "$2a$10$dummyHashThatTakesRoughlyTheSameTimeHere1234567890123");
        }

        if (!user || !isPasswordValid) return registerFailedAttempt();

        // 4. Verifizierungs-Check (Überspringen für lokale Konten ohne E-Mail)
        if (user.email && user.isVerified === false) {
            return fail(403, { 
                error: 'Dein Konto wurde noch nicht bestätigt.',
                unverifiedEmail: user.email 
            });
        }

        // 🔥 NEU: 2FA-Weiche
        if (user.isTwoFactorEnabled) {
            // Nur ein temporäres 5-Minuten-Ticket setzen, noch keine echte Session!
            await startPending2fa(cookies, user);

            // Ziel-URL merken und zur Eingabe des Codes umleiten
            const redirectTo = safeRedirect(url.searchParams.get('redirectTo'));
            throw redirect(303, `/login/2fa?redirectTo=${encodeURIComponent(redirectTo)}`);
        }

        // 5. LOGIN ERFOLGREICH (Für Nutzer ohne 2FA)
        await db.deleteLoginAttempt(ip);

        // 6. SESSION + MULTI-SYSTEM-LOGIK (Cookies setzen VOR dem Redirect!)
        const systems = await startUserSession(cookies, user);

        // 7. FINALE REDIRECT-WEICHE
        const redirectTo = safeRedirect(url.searchParams.get('redirectTo'));

        if (user.mustChangePassword) {
            // Zwingt den Nutzer in unser wasserdichtes Profil-Modal
            throw redirect(303, '/profil');
        } else if (systems.length > 1) {
            // Mehrere Lager -> Systemauswahl
            throw redirect(303, `/select-system?redirectTo=${encodeURIComponent(redirectTo)}`);
        } else if (systems.length === 1) {
            // Nur ein Lager -> Normaler Login
            throw redirect(303, redirectTo);
        } else {
            // Gar kein Lager zugewiesen
            return fail(403, { error: 'Dir ist noch kein Lager zugewiesen. Bitte kontaktiere einen Administrator.' });
        }
    },

    // -------------------------------------------------------------------------
    // AKTION 2: BESTÄTIGUNGS-EMAIL ERNEUT SENDEN
    // -------------------------------------------------------------------------
    resendVerification: async ({ request, getClientAddress }) => {
        const data = await request.formData();
        const email = data.get('email')?.toString().trim().toLowerCase();

        if (!email) return fail(400, { error: 'E-Mail fehlt.' });

        // Schutz vor Mail-Spam
        const perAccount = await db.rateLimit(`resend:${email}`, 3, 60 * 60 * 1000);
        const perIp = await db.rateLimit(`resend-ip:${getClientAddress()}`, 10, 60 * 60 * 1000);
        if (!perAccount.allowed || !perIp.allowed) {
            return fail(429, { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' });
        }

        const newVerData = await db.renewVerificationData(email);
        
        if (newVerData) {
            try {
                await sendVerificationEmail(email, newVerData.code, newVerData.token);
            } catch (error) {
                console.error("Fehler beim erneuten E-Mail-Versand:", error);
            }
        }

        return { resendSuccess: true };
    }
};