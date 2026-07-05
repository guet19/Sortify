import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';

// 🔥 Globaler Speicher für den LED-Timeout, damit wir ihn abbrechen können
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
    // Lässt alle freien Fächer blau leuchten
    lightUpEmptySlots: async ({ cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return { success: false };

        try {
            if (globalLedTimeout) {
                clearTimeout(globalLedTimeout);
                globalLedTimeout = null;
            }

            if (typeof db.triggerEmptyLedsBlue === 'function') {
                await db.triggerEmptyLedsBlue(userId);
            }

            globalLedTimeout = setTimeout(async () => {
                try { await db.createHardwareCommand(userId, [0]); } catch(e){}
                globalLedTimeout = null;
            }, 15000);

            return { success: true };
        } catch (err) {
            console.error("Fehler beim blauen Aufleuchten:", err);
            return { success: false };
        }
    },

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

            // 🔥 NEU: Schalte alle anderen Fächer aus und nur das gewählte blau an!
            if (globalLedTimeout) {
                clearTimeout(globalLedTimeout);
                globalLedTimeout = null;
            }
            
            if (typeof db.triggerSingleLedBlue === 'function') {
                await db.triggerSingleLedBlue(userId, barcode);
            }

            // Verlängerter Timer (30s), da das Wiegen der Box etwas dauern kann
            globalLedTimeout = setTimeout(async () => {
                try { await db.createHardwareCommand(userId, [0]); } catch(e){}
                globalLedTimeout = null;
            }, 30000);

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

    triggerLedOnly: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        const data = await request.formData();
        const barcode = data.get('barcode');
        
        try {
            if (globalLedTimeout) {
                clearTimeout(globalLedTimeout);
                globalLedTimeout = null;
            }

            await db.triggerLedByBarcode(userId, barcode, true);
            
            globalLedTimeout = setTimeout(async () => {
                try { await db.createHardwareCommand(userId, [0]); } catch(e){}
                globalLedTimeout = null;
            }, 10000);

            return { success: true };
        } catch (err) {
            return { success: false };
        }
    },

    updateStockAndLightUp: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        const data = await request.formData();
        
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');
        const newStock = parseInt(data.get('newStock'));

        try {
            await db.updateArticleStockFromWeights(userId, articleId, barcode, newStock);
            
            if (globalLedTimeout) {
                clearTimeout(globalLedTimeout);
                globalLedTimeout = null;
            }

            await db.triggerLedByBarcode(userId, barcode, true);
            
            globalLedTimeout = setTimeout(async () => {
                try { await db.createHardwareCommand(userId, [0]); } catch(e){}
                globalLedTimeout = null;
            }, 10000);

            return { success: true };
        } catch (err) {
            return { success: false, error: 'Buchungsfehler' };
        }
    },

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