import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';

export async function load({ cookies, params }) {
    const session = cookies.get('session');
    if (!session) throw redirect(303, '/login');

    const articleId = params.id;
    const categories = await db.getCategories(session).catch(() => []);
    const attributes = await db.getFilterAttributes(session).catch(() => []); 
    
    let article = await db.getArticleById(session, articleId).catch(() => null);
    if (!article) throw redirect(303, '/terminal/settings/assign');

    return {
        article: JSON.parse(JSON.stringify(article)),
        categories: JSON.parse(JSON.stringify(categories)),
        attributes: JSON.parse(JSON.stringify(attributes))
    };
}

export const actions = {
    // Schritt 1: Prüft, ob der Barcode existiert und frei ist (Speichert noch nichts!)
    checkBarcode: async ({ request, cookies, params }) => {
        const userId = cookies.get('session');
        if (!userId) return { success: false, error: 'Unauthorized' };

        const currentArticleId = params.id;
        const data = await request.formData();
        const barcode = data.get('barcode');

        if (!barcode) return { success: false, error: 'Fehlende Daten' };

        try {
            const barcodeExists = await db.checkIfBarcodeExists(userId, barcode);
            if (!barcodeExists) return { success: false, error: 'not_in_shelves' };

            const duplicateArticle = await db.getArticleByBarcode(userId, barcode);
            if (duplicateArticle && String(duplicateArticle._id) !== String(currentArticleId)) {
                return { success: false, error: 'already_assigned', conflictingArticle: duplicateArticle };
            }

            return { success: true, barcode };
        } catch (err) {
            return { success: false, error: 'Datenbankfehler' };
        }
    },

    // Schritt 2 & 3: Fordert eine Messung beim Raspberry Pi an
    requestScale: async ({ cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return { success: false };

        try {
            // Erstellt die Anfrage in der 'scale_requests' Collection
            const requestId = await db.createScaleRequest(userId, "setup");
            return { success: true, requestId };
        } catch (err) {
            return { success: false, error: 'Waage nicht erreichbar' };
        }
    },

    // Schritt 4: Alles final abspeichern
    saveAll: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        const data = await request.formData();
        
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');
        const boxWeight = data.get('boxWeight');
        const itemWeight = data.get('itemWeight');

        try {
            await db.assignBarcodeAndWeights(userId, articleId, barcode, boxWeight, itemWeight);
            return { success: true };
        } catch (err) {
            return { success: false, error: 'Fehler beim Speichern' };
        }
    },

    // Konflikt-Auflösung und Entfernen
    unlinkBarcode: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        const data = await request.formData();
        try {
            await db.assignBarcodeToArticle(userId, data.get('articleId'), null);
            return { success: true };
        } catch (err) {
            return { success: false };
        }
    }
};