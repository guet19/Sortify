import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';

export async function load({ cookies, params }) {
    const session = cookies.get('session');
    if (!session) throw redirect(303, '/login');

    const articleId = params.id;

    const categories = await db.getCategories(session).catch(() => []);
    const attributes = await db.getFilterAttributes(session).catch(() => []); 
    
    let article = null;
    try {
        article = await db.getArticleById(session, articleId);
    } catch (e) {
        console.error("🔴 Fehler beim Laden des Artikels:", e);
    }

    if (!article) {
        throw redirect(303, '/terminal/settings/assign');
    }

    return {
        article: JSON.parse(JSON.stringify(article)),
        categories: JSON.parse(JSON.stringify(categories)),
        attributes: JSON.parse(JSON.stringify(attributes))
    };
}

export const actions = {
    linkArticle: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');

        if (!articleId || !barcode) {
            return { success: false, error: 'Fehlende Daten' };
        }

        try {
            // HIER RUFEN WIR DIE FUNKTION STATTDESSEN ÜBER DB.JS AUF:
            const barcodeExists = await db.checkIfBarcodeExists(userId, barcode);
            
            if (!barcodeExists) {
                return { success: false, error: 'not_in_shelves' };
            }

            await db.assignBarcodeToArticle(userId, articleId, barcode);
            return { success: true };
        } catch (err) {
            console.error("🔴 Fehler beim Verknüpfen:", err);
            return { success: false, error: 'Datenbankfehler' };
        }
    },

    unlinkBarcode: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        const articleId = data.get('articleId');

        if (!articleId) {
            return { success: false, error: 'Fehlende Daten' };
        }

        try {
            await db.assignBarcodeToArticle(userId, articleId, null);
            return { success: true };
        } catch (err) {
            console.error("🔴 Fehler beim Entfernen des Barcodes:", err);
            return { success: false, error: 'Datenbankfehler' };
        }
    }
};