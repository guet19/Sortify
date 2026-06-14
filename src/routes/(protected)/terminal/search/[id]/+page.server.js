import db from '$lib/server/db.js';
import { redirect } from '@sveltejs/kit';

export async function load({ params, cookies }) {
    // 1. Die ID des aktuell eingeloggten Nutzers aus dem Cookie auslesen
    const userId = cookies.get('session');
    
    // KIOSK-UX: Wenn die Session abgelaufen ist, sofort zum Login zurückschicken.
    if (!userId) {
        throw redirect(303, '/login');
    }

    // 2. Die Artikel-ID aus der URL auslesen
    const articleId = params.id;

    // 3. Den spezifischen Artikel MIT der userId aus der Datenbank holen
    const article = await db.getArticleById(userId, articleId);

    // 4. KIOSK-UX: Wenn der Artikel nicht gefunden wird (z.B. falscher Barcode-Scan),
    // werfen wir keinen Fehlerbildschirm, sondern leiten sanft zurück zur Suche.
    if (!article) {
        throw redirect(303, '/terminal/search');
    }

    // 5. Metadaten laden (streng an den User gebunden!)
    const categories = await db.getCategories(userId);
    const attributes = await db.getFilterAttributes(userId);

    // 6. Alles "entschärft" an das Terminal Frontend (+page.svelte) übergeben
    return {
        article: JSON.parse(JSON.stringify(article)),
        categories: JSON.parse(JSON.stringify(categories)),
        attributes: JSON.parse(JSON.stringify(attributes))
    };
}

// HINWEIS: 
// Der `actions = { updateStock: ... }` Block aus deiner Original-Datei 
// wurde hier absichtlich komplett entfernt!
// Dadurch ist es technisch völlig unmöglich, dass jemand über das Terminal 
// den Bestand manipuliert, selbst wenn er es über die Konsole versuchen würde.
// Das Terminal bleibt an dieser Stelle also "Read-Only" (nur Lese-Zugriff).