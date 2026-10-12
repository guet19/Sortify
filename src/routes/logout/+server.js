import { redirect } from '@sveltejs/kit';
import dbClient from '$lib/server/db.js';
import { hashToken } from '$lib/server/security.js';

// Logout nur per POST: <form method="POST" action="/logout"><button>Abmelden</button></form>
// (Ein GET-Link könnte von fremden Seiten z.B. über ein <img> ausgelöst werden.
// Formular-POSTs von fremden Seiten blockiert SvelteKit automatisch.)
export async function POST({ cookies }) {
    const sessionToken = cookies.get('session');

    if (sessionToken) {
        try {
            // Session serverseitig ungültig machen (Cookie allein löschen reicht nicht)
            await dbClient.deleteSession(sessionToken);
            // Log-Eintrag abschließen: logoutTime setzen
            await dbClient.endSessionLog(hashToken(sessionToken));
        } catch (error) {
            console.error("Fehler beim Logout:", error);
        }
    }

    // WICHTIG: Beide Cookies sicher und vollständig löschen!
    cookies.delete('session', { path: '/' });
    cookies.delete('systemId', { path: '/' }); // Verhindert verwaiste Lager-Sitzungen

    // Zurück zum Login leiten inkl. Erfolgsmeldung
    throw redirect(303, '/login?loggedOut=true');
}

// Alte Links/Lesezeichen auf /logout führen einfach zur Startseite
export function GET() {
    throw redirect(303, '/');
}
