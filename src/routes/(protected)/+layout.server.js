import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';

// NEU: Wir fügen 'url' in die Klammern ein, um zu wissen, woher der Nutzer kommt
export async function load({ cookies, url }) {
    const session = cookies.get('session');

    if (!session) {
        // NEU: Wir merken uns den Pfad und alle Parameter (wie die Daten vom Lesezeichen)
        const fromUrl = url.pathname + url.search;
        throw redirect(303, `/login?redirectTo=${encodeURIComponent(fromUrl)}`);
    }

    // Nutzer anhand der Session (userId) aus der DB holen
    const user = await db.getUserById(session);

    // Falls die Session noch im Browser ist, der Nutzer in der DB aber gelöscht wurde
    if (!user) {
        cookies.delete('session', { path: '/' });
        const fromUrl = url.pathname + url.search;
        throw redirect(303, `/login?redirectTo=${encodeURIComponent(fromUrl)}`);
    }

    // Wir geben nur die unkritischen Daten ans Frontend weiter (kein Passwort!)
    return {
        isLoggedIn: true,
        user: {
            firstName: user.firstName || 'Benutzer',
            lastName: user.lastName || '',
            email: user.email
        }
    };
}