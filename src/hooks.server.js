import db from '$lib/server/db.js';
import { redirect } from '@sveltejs/kit'; // Import für den kontrollierten Rausschmiss

export async function handle({ event, resolve }) {
    // 1. Cookies auslesen (Dein User-Cookie heißt bei dir aktuell 'session')
    const userId = event.cookies.get('session'); 
    const systemId = event.cookies.get('systemId');

    if (userId) {
        // 2. User über deine bestehende db.js Funktion laden
        const user = await db.getUserById(userId);

        if (user) {
            // ZWANGS-PRÜFUNG FÜR DIE PASSWORTÄNDERUNG
            // Wenn das Flag aktiv ist, darf der User NUR auf die /profil-Route zugreifen.
            // Versucht er, die URL zu manipulieren oder eine andere Seite aufzurufen,
            // werden alle Cookies gelöscht (Abmeldung) und er fliegt zurück zum Login.
            if (user.mustChangePassword && !event.url.pathname.startsWith('/profil')) {
                event.cookies.delete('session', { path: '/' });
                event.cookies.delete('systemId', { path: '/' });
                if (event.cookies.get('pending2fa')) {
                    event.cookies.delete('pending2fa', { path: '/' });
                }
                
                throw redirect(303, '/login?error=password_change_required');
            }

            // 3. User-Daten in 'locals' (den Rucksack) packen
            // 🔥 FIX: 'username' hinzugefügt und Fallbacks gesetzt, um leere Felder abzufangen
            event.locals.user = {
                id: user._id.toString(),
                username: user.username || null,
                firstName: user.firstName || null,
                lastName: user.lastName || null,
                email: user.email || null,
                mustChangePassword: user.mustChangePassword
            };

            // 4. LIVE-RECHTEPRÜFUNG: Wenn ein System/Lager ausgewählt wurde
            if (systemId && user.systems) {
                // Wir suchen im systems-Array des Users nach der passenden Lager-ID
                const systemContext = user.systems.find(s => s.systemId.toString() === systemId);
                
                if (systemContext) {
                    event.locals.systemId = systemId;
                    event.locals.role = systemContext.role; // z.B. 'admin' oder 'worker'
                } else {
                    // Sicherheitsmaßnahme: User hat das System im Cookie, 
                    // aber in der Datenbank keine Rechte (mehr) dafür.
                    event.cookies.delete('systemId', { path: '/' });
                }
            }
        } else {
            // Fallback: Cookie ist noch im Browser, aber User wurde in der DB gelöscht
            event.cookies.delete('session', { path: '/' });
            event.cookies.delete('systemId', { path: '/' });
        }
    }

    // 5. Die Anfrage an die eigentliche Svelte-Seite weitergeben
    return await resolve(event);
}