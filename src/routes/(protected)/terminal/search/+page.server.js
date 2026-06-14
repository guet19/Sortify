// src/routes/terminal/search/+page.server.js
import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';

export async function load({ cookies }) {
    const session = cookies.get('session');

    if (!session) {
        // Leitet zurück zur Terminal-Startseite oder zum Login, 
        // damit der User nicht versehentlich im Admin-Bereich landet
        throw redirect(303, '/login'); 
    }

    // Die Session (Mandanten-ID) wird an die DB übergeben
    const categories = await db.getCategories(session);
    const articles = await db.getArticles(session);
    const attributes = await db.getFilterAttributes(session); 
    
    return {
        categories,
        articles,
        attributes 
    };
}