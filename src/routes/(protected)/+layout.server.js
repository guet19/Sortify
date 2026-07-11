import { redirect } from '@sveltejs/kit';

export async function load({ locals, url }) {
    // 1. Ist der User eingeloggt?
    if (!locals.user) {
        const fromUrl = url.pathname + url.search;
        throw redirect(303, `/login?redirectTo=${encodeURIComponent(fromUrl)}`);
    }

    // 2. Hat der User ein aktives System gewählt?
    if (!locals.systemId) {
        // Falls er noch kein System ausgewählt hat, leiten wir ihn zur Systemauswahl
        // (Diese Seite /select-system müssten wir noch im Hauptverzeichnis erstellen)
        throw redirect(303, '/select-system');
    }

    // 3. Alles in Ordnung! Wir geben User, System und Rolle ans Frontend
    return {
        isLoggedIn: true,
        user: locals.user,
        systemId: locals.systemId,
        role: locals.role
    };
}