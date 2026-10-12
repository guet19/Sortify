// src/routes/verify/+page.server.js
import { fail, redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export const actions = {
    default: async ({ request, getClientAddress }) => {
        const data = await request.formData();
        const email = data.get('email')?.toString().trim().toLowerCase();
        const code = data.get('code')?.toString().trim();

        if (!email || !code) return fail(400, { error: "Bitte gib den Code ein." });

        // Brute-Force-Schutz: max. 5 Versuche pro Konto und 20 pro IP in 15 Minuten
        const perAccount = await db.rateLimit(`verify:${email}`, 5, FIFTEEN_MINUTES);
        const perIp = await db.rateLimit(`verify-ip:${getClientAddress()}`, 20, FIFTEEN_MINUTES);
        if (!perAccount.allowed || !perIp.allowed) {
            return fail(429, { error: "Zu viele Versuche. Bitte warte 15 Minuten oder fordere einen neuen Code an." });
        }

        const user = await db.getUserByIdentifier(email);
        
        // Gleiche Meldung für "Nutzer unbekannt" und "falscher Code" (verrät keine Konten)
        if (!user || !user.verificationCode || user.verificationCode !== code) {
            return fail(400, { error: "Falscher Code." });
        }

        const result = await db.verifyUser(user.email, false);
        
        if (result.success) {
            throw redirect(303, '/login?verified=true');
        } else {
            return fail(400, { error: result.message });
        }
    }
};
