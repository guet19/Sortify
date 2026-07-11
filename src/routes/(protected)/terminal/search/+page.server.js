import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';

export async function load({ locals }) { // NEU: locals statt cookies
    // 1. Die System-ID des aktuell aktiven Lagers abrufen
    const systemId = locals.systemId;

    if (!systemId) {
        // Leitet zurück zur Systemauswahl oder zum Login
        throw redirect(303, '/login'); 
    }

    // 2. Die System-ID wird an die Datenbank übergeben, um nur die Daten dieses Lagers zu laden
    const categories = await db.getCategories(systemId);
    const articles = await db.getArticles(systemId);
    const attributes = await db.getFilterAttributes(systemId); 
    
    // 3. POJO-Fix für die fehlerfreie Übergabe an das SvelteKit-Frontend
    return {
        categories: JSON.parse(JSON.stringify(categories)),
        articles: JSON.parse(JSON.stringify(articles)),
        attributes: JSON.parse(JSON.stringify(attributes)) 
    };
}