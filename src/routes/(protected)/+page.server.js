import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';

export async function load({ locals }) {
    // 1. Prüfen, ob der Nutzer überhaupt eingeloggt ist
    if (!locals.user) {
        throw redirect(303, '/login');
    }

    // 2. Prüfen, ob er ein aktives System (Lager) ausgewählt hat
    if (!locals.systemId) {
        throw redirect(303, '/select-system'); 
    }

    // 3. Daten für das spezifische System laden
    const categories = await db.getCategories(locals.systemId);
    const articles = await db.getArticles(locals.systemId);
    const attributes = await db.getFilterAttributes(locals.systemId); 
    
    // 4. WICHTIG: POJO-Fix anwenden, um Serialisierungsfehler im Frontend zu verhindern
    return {
        categories: JSON.parse(JSON.stringify(categories)),
        articles: JSON.parse(JSON.stringify(articles)),
        attributes: JSON.parse(JSON.stringify(attributes)),
        role: locals.role 
    };
}