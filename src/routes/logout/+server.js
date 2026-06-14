import { redirect } from '@sveltejs/kit';
import dbClient from '$lib/server/db.js';

// Anstelle von "actions" nutzen wir hier die Methode "GET".
// Dadurch kannst du den Logout überall in deiner App über einen 
// simplen HTML-Link aufrufen: <a href="/logout">Abmelden</a>
export async function GET({ cookies }) {
    const sessionId = cookies.get('session');

    if (sessionId) {
        try {
            const db = await dbClient.getDb();
            // Log-Eintrag abschließen: logoutTime setzen
            await db.collection('sessionLogs').updateOne(
                { sessionId: sessionId },
                { $set: { logoutTime: new Date(), lastActive: new Date() } }
            );
        } catch (error) {
            console.error("Fehler beim Logout-Logging:", error);
        }
    }

    // Cookie sicher löschen
    cookies.delete('session', { path: '/' });

    // Zurück zum Login leiten inkl. Erfolgsmeldung
    throw redirect(303, '/login?loggedOut=true');
}