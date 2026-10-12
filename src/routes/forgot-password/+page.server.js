import { fail } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { sendPasswordResetEmail } from '$lib/server/email.js';

const ONE_HOUR = 60 * 60 * 1000;

export const actions = {
    default: async ({ request, getClientAddress }) => {
        const data = await request.formData();
        const email = data.get('email')?.toString().toLowerCase().trim();
        if (!email) {
            return fail(400, { error: 'Bitte gib eine E-Mail-Adresse ein.' });
        }

        // Schutz vor Mail-Spam: max. 3 Mails pro Adresse und 10 pro IP und Stunde
        const perAccount = await db.rateLimit(`reset:${email}`, 3, ONE_HOUR);
        const perIp = await db.rateLimit(`reset-ip:${getClientAddress()}`, 10, ONE_HOUR);
        if (!perAccount.allowed || !perIp.allowed) {
            return fail(429, { error: 'Zu viele Anfragen. Bitte versuche es später erneut.' });
        }

        // Token in der DB generieren (null, falls die Adresse nicht existiert)
        const token = await db.savePasswordResetToken(email);

        if (token) {
            try {
                await sendPasswordResetEmail(email, token);
            } catch (error) {
                console.error("[Passwort-Reset] Fehler beim E-Mail-Versand:", error);
            }
        }

        // WICHTIG FÜR SECURITY: Wir geben im Frontend immer "Erfolg" zurück, 
        // auch wenn die E-Mail nicht existierte (Schutz vor Hackern).
        return { success: true };
    }
};
