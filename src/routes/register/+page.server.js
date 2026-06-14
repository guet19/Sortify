// src/routes/register/+page.server.js
import { fail, redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { sendVerificationEmail } from '$lib/server/email.js';
// ACHTUNG: Der 'crypto' Import wurde entfernt, da er Netlify zum Absturz bringen kann!

export async function load({ cookies }) {
    if (cookies.get('session')) {
        throw redirect(303, '/');
    }
}

export const actions = {
    default: async ({ request, url }) => {
        const data = await request.formData();
        
        const email = data.get('email')?.toString().trim();
        const password = data.get('password')?.toString();
        const passwordConfirm = data.get('passwordConfirm')?.toString();
        
        const firstName = data.get('firstName')?.toString().trim() || "";
        const lastName = data.get('lastName')?.toString().trim() || "";
        const country = data.get('country')?.toString().trim() || "";
        const birthDate = data.get('birthDate')?.toString() || null;

        if (!email || !password || !firstName || !lastName) {
            return fail(400, { error: "Bitte fülle alle Pflichtfelder aus." });
        }

        if (password !== passwordConfirm) {
            return fail(400, { error: "Die Passwörter stimmen nicht überein." });
        }

        if (password.length < 6) {
            return fail(400, { error: "Das Passwort muss mindestens 6 Zeichen lang sein." });
        }

        try {
            // Nutzt jetzt die global verfügbare Web Crypto API (ohne Import)
            const vCode = Math.floor(100000 + Math.random() * 900000).toString(); 
            const vToken = crypto.randomUUID(); 
            const vExpires = new Date(Date.now() + 15 * 60 * 1000); 

            const verificationData = { code: vCode, token: vToken, expires: vExpires };
            const profileData = { firstName, lastName, country, birthDate };

            const result = await db.createInitialUser(email, password, profileData, verificationData);
            
            if (!result.success) {
                return fail(400, { error: result.message }); 
            }

            // Sicherer Versuch, die E-Mail zu senden
            try {
                await sendVerificationEmail(email, vCode, vToken);
            } catch (mailError) {
                // Wenn die Mail fehlschlägt, loggen wir es sauber für Netlify, 
                // lassen den Nutzer aber trotzdem ins System (da du ihn ja über den Login abfängst)
                console.error("Mail-Versand nach Registrierung fehlgeschlagen:", mailError);
            }

            throw redirect(303, `/verify?email=${encodeURIComponent(email)}`);

        } catch (err) {
            if (err.status === 303) throw err;
            
            console.error("Fehler bei der Registrierung:", err);
            return fail(500, { error: "Ein unerwarteter Fehler ist aufgetreten." });
        }
    }
};