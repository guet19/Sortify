// src/routes/artikel/+page.server.js
import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';

export async function load({ cookies }) {
    // 1. Prüfen, ob der Nutzer einen gültigen Session-Cookie hat
    const session = cookies.get('session');

    if (!session) {
        // 2. Wenn kein Cookie gefunden wird, sofort zur Login-Seite schicken
        // (Der Code darunter wird gar nicht erst ausgeführt, die DB wird geschont)
        throw redirect(303, '/login');
    }

    // 3. Wenn der Cookie existiert, ganz normal die Daten für die Seite laden
    // WICHTIG: Hier übergeben wir jetzt die 'session' (deine User-ID) an die DB!
    const categories = await db.getCategories(session);
    const articles = await db.getArticles(session);
    const attributes = await db.getFilterAttributes(session); 
    
    return {
        categories,
        articles,
        attributes 
    };
}