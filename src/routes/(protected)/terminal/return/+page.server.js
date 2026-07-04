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

    requestScale: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        const data = await request.formData();
        const barcode = data.get('barcode');

        await new Promise(resolve => setTimeout(resolve, 1000));
        const requestId = await db.createScaleRequest(userId, barcode);
        return { success: true, requestId };
    },

    bookReturn: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        const data = await request.formData();
        
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');
        const newDrawerStock = parseInt(data.get('newStock'));

        if (!articleId || !barcode || isNaN(newDrawerStock)) {
            return { success: false, error: 'Fehlende Buchungsdaten' };
        }

        try {
            // Bestand buchen (setzt intern lastWeighedAt und lastReturnedAt)
            await db.updateArticleStockFromWeights(userId, articleId, barcode, newDrawerStock);
            await db.triggerLedByBarcode(userId, barcode, true);
            
            setTimeout(async () => {
                try { await db.createHardwareCommand(userId, [0]); } catch (e) {}
            }, 10000);

            return { success: true, step: 'done' };
        } catch (err) {
            console.error("🔴 Fehler in Action bookReturn:", err);
            return { success: false, error: 'Buchungsfehler' };
        }
    },

    // 🔥 NEUE ACTION: Direktes Einlagern ohne Waage (Wiegen überspringen)
    returnWithoutWeighing: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return { success: false };

        const data = await request.formData();
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');

        if (!articleId || !barcode) {
            return { success: false, error: 'Fehlende Daten' };
        }

        try {
            // Nur den Zeitstempel für die Retoure aktualisieren, da nicht gewogen wurde!
            await db.logArticleAction(userId, articleId, 'return');
            
            // LED für dieses eine Fach aktivieren
            await db.triggerLedByBarcode(userId, barcode, true);
            
            // 10-Sekunden Timer zum automatischen Hardware-Ausschalten
            setTimeout(async () => {
                try { await db.createHardwareCommand(userId, [0]); } catch (e) {}
            }, 10000);

            return { success: true, step: 'done' };
        } catch (err) {
            console.error("🔴 Fehler in Action returnWithoutWeighing:", err);
            return { success: false };
        }
    }
};