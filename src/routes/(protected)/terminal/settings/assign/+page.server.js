import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';

export async function load({ cookies }) {
    const session = cookies.get('session');
    if (!session) throw redirect(303, '/login');

    const categories = await db.getCategories(session).catch(() => []);
    const articles = await db.getArticles(session).catch(() => []);
    const attributes = await db.getFilterAttributes(session).catch(() => []); 
    
    return {
        categories: JSON.parse(JSON.stringify(categories)),
        articles: JSON.parse(JSON.stringify(articles)),
        attributes: JSON.parse(JSON.stringify(attributes))
    };
}