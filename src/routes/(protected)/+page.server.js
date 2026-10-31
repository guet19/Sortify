import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { openOrderQuantities } from '$lib/server/orders.js';

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
    // Unabhängige Abfragen parallel statt nacheinander
    const [categories, articles, attributes, topConsumption, onOrder] = await Promise.all([
        db.getCategories(locals.systemId),
        db.getArticles(locals.systemId),
        db.getFilterAttributes(locals.systemId),
        db.getTopConsumption(locals.systemId, 30, 5).catch(() => []),
        // Offene Bestellungen: bereits bestellte Artikel zählen nicht als "nachbestellen"
        openOrderQuantities(locals.systemId).catch(() => ({}))
    ]);
    
    // 4. WICHTIG: POJO-Fix anwenden, um Serialisierungsfehler im Frontend zu verhindern
    return {
        categories: JSON.parse(JSON.stringify(categories)),
        articles: JSON.parse(JSON.stringify(articles)),
        attributes: JSON.parse(JSON.stringify(attributes)),
        role: locals.role,
        topConsumption,
        onOrder
    };
}