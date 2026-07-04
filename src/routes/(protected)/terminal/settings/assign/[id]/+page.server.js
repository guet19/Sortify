import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';

// 🔥 Globaler Speicher für den LED-Timeout, damit wir ihn abbrechen können,
// wenn der User schneller ist als die 10 Sekunden!
let globalLedTimeout = null;

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
    checkBarcode: async ({ request, cookies, params }) => {
        const userId = cookies.get('session');
        if (!userId) return { success: false, error: 'Unauthorized' };

        const currentArticleId = params.id;
        const data = await request.formData();
        let barcode = data.get('barcode');

        if (!barcode) {
            return { success: false, error: 'Fehlende Daten' };
        }

        barcode = String(barcode).trim();

        try {
            const duplicateArticle = await db.getArticleByBarcode(userId, barcode);
            
            if (duplicateArticle && String(duplicateArticle._id) !== String(currentArticleId)) {
                const safeArticle = JSON.parse(JSON.stringify(duplicateArticle));
                return { success: false, error: 'already_assigned', conflictingArticle: safeArticle, barcode };
            }

            const barcodeExists = await db.checkIfBarcodeExists(userId, barcode);

            if (!barcodeExists) {
                return { success: false, error: 'not_in_shelves' };
            }

            return { success: true, barcode };
        } catch (err) {
            return { success: false, error: 'Datenbankfehler' };
        }
    },

    requestScale: async ({ cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return { success: false };

        try {
            const requestId = await db.createScaleRequest(userId, "setup");
            return { success: true, requestId };
        } catch (err) {
            return { success: false, error: 'Waage nicht erreichbar' };
        }
    },

    saveAll: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        const data = await request.formData();
        
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');
        
        const boxWeight = parseFloat(data.get('boxWeight'));
        const itemWeight = parseFloat(data.get('itemWeight'));

        try {
            await db.assignBarcodeAndWeights(userId, articleId, barcode, boxWeight, itemWeight);
            return { success: true };
        } catch (err) {
            return { success: false, error: 'Fehler beim Speichern' };
        }
    },

    unlinkBarcode: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        const data = await request.formData();
        
        const articleId = data.get('articleId');
        const barcode = data.get('barcode'); 
        
        try {
            await db.removeBarcodes(userId, articleId, barcode);
            return { success: true };
        } catch (err) {
            return { success: false };
        }
    },

    // Der LED-Trigger räumt jetzt immer auf, bevor er feuerte!
    triggerLedOnly: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        const data = await request.formData();
        const barcode = data.get('barcode');
        
        try {
            // Alten, noch laufenden Timeout sofort stoppen (verhindert das Abwürgen!)
            if (globalLedTimeout) {
                clearTimeout(globalLedTimeout);
                globalLedTimeout = null;
            }

            await db.triggerLedByBarcode(userId, barcode, true);
            
            // Neuen, exakten 10-Sekunden-Timer setzen
            globalLedTimeout = setTimeout(async () => {
                try { await db.createHardwareCommand(userId, [0]); } catch(e){}
                globalLedTimeout = null;
            }, 10000);

            return { success: true };
        } catch (err) {
            return { success: false };
        }
    },

    // Auch hier räumen wir alte Timeouts sauber auf!
    updateStockAndLightUp: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        const data = await request.formData();
        
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');
        const newStock = parseInt(data.get('newStock'));

        try {
            await db.updateArticleStockFromWeights(userId, articleId, barcode, newStock);
            
            // Alten Timeout stoppen
            if (globalLedTimeout) {
                clearTimeout(globalLedTimeout);
                globalLedTimeout = null;
            }

            await db.triggerLedByBarcode(userId, barcode, true);
            
            // Neuen Timeout setzen
            globalLedTimeout = setTimeout(async () => {
                try { await db.createHardwareCommand(userId, [0]); } catch(e){}
                globalLedTimeout = null;
            }, 10000);

            return { success: true };
        } catch (err) {
            return { success: false, error: 'Buchungsfehler' };
        }
    },

    // Speichert das Gewicht und alle veränderten Fächer im letzten Schritt
    saveWeightAndAllStocks: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        const data = await request.formData();
        
        const articleId = data.get('articleId');
        const itemWeight = parseFloat(data.get('itemWeight'));
        const slotsDataStr = data.get('slotsData');

        try {
            await db.updateArticleItemWeight(userId, articleId, itemWeight);
            
            if (slotsDataStr) {
                const slotsData = JSON.parse(slotsDataStr);
                for (const slot of slotsData) {
                    await db.updateArticleStockFromWeights(userId, articleId, slot.barcode, slot.newStock);
                }
            }

            // Beim finalen Speichern wollen wir das Licht immer hart aus haben
            if (globalLedTimeout) {
                clearTimeout(globalLedTimeout);
                globalLedTimeout = null;
            }
            try { await db.createHardwareCommand(userId, [0]); } catch(e){}

            return { success: true };
        } catch (err) {
            console.error("Fehler beim Sammelspeichern:", err);
            return { success: false, error: 'Speicherfehler bei der Sammelbuchung' };
        }
    }
};