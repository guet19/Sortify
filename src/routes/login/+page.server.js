import { redirect, fail } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import db from '$lib/server/db.js';
import { sendVerificationEmail } from '$lib/server/email.js';

export async function load({ cookies, url }) {
    // Wenn jemand schon eingeloggt ist, leiten wir ihn direkt weiter.
    // Falls er vom KI-Lesezeichen kommt, schicken wir ihn ans Ziel, sonst aufs Dashboard.
    if (cookies.get('session')) {
        const redirectTo = url.searchParams.get('redirectTo') || '/';
        throw redirect(303, redirectTo);
    }
}

export const actions = {
    // -------------------------------------------------------------------------
    // AKTION 1: DER NORMALE LOGIN
    // -------------------------------------------------------------------------
    login: async ({ request, cookies, getClientAddress, url }) => {
        const ip = getClientAddress();
        const now = new Date();
        
        // 1. Bisherige Login-Versuche für diese IP laden (Rate-Limiting)
        let attemptData = await db.getLoginAttempt(ip);
        if (!attemptData) {
            attemptData = { ip: ip, count: 0, lockUntil: new Date(0) };
        }

        // 2. Prüfen, ob die IP aktuell wegen zu vieler Fehlversuche gesperrt ist
        if (attemptData.lockUntil > now) {
            const remainingMinutes = Math.ceil((attemptData.lockUntil.getTime() - now.getTime()) / 60000);
            return fail(429, { 
                error: `Zu viele Fehlversuche. Deine IP ist für ${remainingMinutes} Minute(n) gesperrt.` 
            });
        }

        const data = await request.formData();
        const email = data.get('email');
        const password = data.get('password');

        if (!email || !password) {
            return fail(400, { error: 'Bitte fülle alle Felder aus.' });
        }

        // Hilfsfunktion: Speichert einen Fehlversuch ab und checkt Sperrzeiten
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
            return fail(401, { error: `E-Mail oder Passwort falsch. Noch ${attemptsLeft} Versuch(e).` });
        };

        // 3. Nutzer suchen & Timing-Attack-Schutz
        const user = await db.getUserByEmail(email);
        let isPasswordValid = false;

        if (user) {
            isPasswordValid = await bcrypt.compare(password, user.password);
        } else {
            // Dummy-Hash prüfen (Security Best Practice)
            await bcrypt.compare(password, "$2a$10$dummyHashThatTakesRoughlyTheSameTimeHere1234567890123");
        }

        if (!user || !isPasswordValid) return registerFailedAttempt();

        // 4. Verifizierungs-Check
        if (user.isVerified === false) {
            // WICHTIG: Wir geben die E-Mail ans Frontend zurück, damit der "Erneut senden"-Button funktioniert
            return fail(403, { 
                error: 'Dein Konto wurde noch nicht bestätigt.',
                unverifiedEmail: email
            });
        }

        // 5. LOGIN ERFOLGREICH!
        await db.deleteLoginAttempt(ip);

        // Die echte MongoDB User-ID als Session-ID nutzen
        const sessionId = user._id.toString(); 

        // Session Log anlegen
        await db.createSessionLog(sessionId, user._id, user.email);

        // Cookie setzen (sameSite: 'lax' ist wichtig für das KI-Lesezeichen)
        cookies.set('session', sessionId, {
            path: '/', 
            httpOnly: true, 
            sameSite: 'lax', 
            secure: process.env.NODE_ENV === 'production', 
            maxAge: 60 * 60 * 24 * 7 // 7 Tage gültig
        });

        // Schauen, ob sich das Lesezeichen ein Ziel gemerkt hat
        const redirectTo = url.searchParams.get('redirectTo') || '/';
        throw redirect(303, redirectTo); 
    },

    // -------------------------------------------------------------------------
    // AKTION 2: BESTÄTIGUNGS-EMAIL ERNEUT SENDEN
    // -------------------------------------------------------------------------
    resendVerification: async ({ request }) => {
        const data = await request.formData();
        const email = data.get('email');

        if (!email) return fail(400, { error: 'E-Mail fehlt.' });

        const newVerData = await db.renewVerificationData(email);
        
        if (newVerData) {
            try {
                await sendVerificationEmail(email, newVerData.code, newVerData.token);
            } catch (error) {
                console.error("Fehler beim erneuten E-Mail-Versand:", error);
            }
        }

        // Wir geben aus Sicherheitsgründen immer 'success' zurück
        return { resendSuccess: true };
    }
};