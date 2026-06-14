import { fail } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { sendPasswordResetEmail } from '$lib/server/email.js';

export const actions = {
    default: async ({ request }) => {
        const data = await request.formData();
        const email = data.get('email').toString().toLowerCase().trim();
        if (!email) {
            return fail(400, { error: 'Bitte gib eine E-Mail-Adresse ein.' });
        }

        console.log(`[Passwort-Reset] Anfrage für E-Mail: ${email}`);

        // Token in der DB generieren
        const token = await db.savePasswordResetToken(email);

        if (!token) {
            console.log("[Passwort-Reset] ABBRUCH: E-Mail nicht in der Datenbank gefunden oder Tippfehler.");
        } else {
            console.log("[Passwort-Reset] Token generiert. Versuche E-Mail zu senden...");
            try {
                // HIER IST DER FIX: Nur noch 2 Parameter (email und token) übergeben!
                await sendPasswordResetEmail(email, token);
                console.log("[Passwort-Reset] ERFOLG: E-Mail wurde an den SMTP-Server übergeben!");
            } catch (error) {
                console.error("[Passwort-Reset] KRITISCHER FEHLER beim E-Mail-Versand:", error);
            }
        }

        // WICHTIG FÜR SECURITY: Wir geben im Frontend immer "Erfolg" zurück, 
        // auch wenn die E-Mail nicht existierte (Schutz vor Hackern).
        return { success: true };
    }
};