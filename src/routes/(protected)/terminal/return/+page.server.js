import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';

export async function load({ cookies }) {
    const session = cookies.get('session');
    if (!session) throw redirect(303, '/login');

    const articles = await db.getArticles(session).catch(() => []);
    
    return {
        articles: JSON.parse(JSON.stringify(articles))
    };
}

export const actions = {
    // 1. Nur Scannen und Daten laden (keine Waage starten!)
    scanForReturn: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        const barcode = data.get('barcode');

        if (!barcode || barcode.trim() === '') {
            return { success: false, error: 'invalid_barcode' };
        }

        try {
            const article = await db.getArticleByBarcode(userId, barcode);
            const drawer = await db.getDrawerByBarcode(userId, barcode);

            if (!article || !drawer) {
                return { success: false, error: 'unknown_barcode' };
            }

            if (drawer.boxWeight === undefined || drawer.boxWeight === null || !article.attributes?.itemWeight) {
                return { success: false, error: 'missing_weights', article: JSON.parse(JSON.stringify(article)) };
            }
            
            // GEÄNDERT: Wir übergeben direkt den Schritt 'instruction' und starten KEINE Waage
            return { 
                success: true, 
                step: 'instruction', 
                article: JSON.parse(JSON.stringify(article)),
                boxWeight: drawer.boxWeight 
            };

        } catch (err) {
            console.error("🔴 Fehler in Action scanForReturn:", err);
            return { success: false, error: 'Datenbankfehler' };
        }
    },

    // 2. NEUE ACTION: Waage starten (Wird per Button-Klick ausgelöst)
    requestScale: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        const data = await request.formData();
        const barcode = data.get('barcode');

        // 🔥 Der Trick: Wir lassen das System 1 Sekunde warten, damit die Box ruhig liegt
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Jetzt erst schicken wir den Befehl an die Datenbank für den Raspberry Pi
        const requestId = await db.createScaleRequest(userId, barcode);
        return { success: true, requestId };
    },

    // 3. Buchen
    bookReturn: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        const data = await request.formData();
        
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');
        const newStock = parseInt(data.get('newStock'));

        try {
            await db.updateArticleStock(userId, articleId, newStock);
            const triggeredLedIndex = await db.triggerLedByBarcode(userId, barcode);
            
            setTimeout(async () => {
                await db.createHardwareCommand(userId, 0);
            }, 10000);

            return { success: true, step: 'done' };
        } catch (err) {
            return { success: false, error: 'Buchungsfehler' };
        }
    }
};