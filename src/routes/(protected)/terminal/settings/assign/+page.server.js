import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';

export async function load({ locals }) { // NEU: locals statt cookies
    // 1. Sichere System-ID aus dem Rucksack holen
    const systemId = locals.systemId;
    
    // Wenn kein Lager zugewiesen/ausgewählt ist, geht es zurück zum Login
    if (!systemId) throw redirect(303, '/login');

    // 2. Abfragen streng an das Lager (systemId) binden
    // Unabhängige Abfragen parallel statt nacheinander
    const [categories, articles, attributes] = await Promise.all([
        db.getCategories(systemId).catch(() => []),
        db.getArticles(systemId).catch(() => []),
        db.getFilterAttributes(systemId).catch(() => [])
    ]);
    
    // 3. POJO-Fix für die sichere Datenübergabe
    return {
        categories: JSON.parse(JSON.stringify(categories)),
        articles: JSON.parse(JSON.stringify(articles)),
        attributes: JSON.parse(JSON.stringify(attributes))
    };
}