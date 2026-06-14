// src/routes/verify/+page.server.js
import { fail, redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';

export const actions = {
    default: async ({ request }) => {
        const data = await request.formData();
        const email = data.get('email');
        const code = data.get('code')?.trim();

        if (!email || !code) return fail(400, { error: "Bitte gib den Code ein." });

        const user = await db.getUserByEmail(email); // Vorausgesetzt du hast diese Funktion noch
        
        if (!user) return fail(404, { error: "Nutzer nicht gefunden." });
        if (user.verificationCode !== code) return fail(400, { error: "Falscher Code." });

        const result = await db.verifyUser(email, false);
        
        if (result.success) {
            throw redirect(303, '/login?verified=true');
        } else {
            return fail(400, { error: result.message });
        }
    }
};