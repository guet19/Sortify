import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';

export async function load({ locals }) { // NEU: locals statt cookies
    const systemId = locals.systemId;
    if (!systemId) throw redirect(303, '/login');

    const articles = await db.getArticles(systemId).catch(() => []);
    
    return {
        articles: JSON.parse(JSON.stringify(articles))
    };
}

export const actions = {
    // 1. Manueller Trigger (nur schauen, wo das Fach ist)
    triggerLED: async ({ request, locals }) => { // NEU: locals
        const systemId = locals.systemId;
        if (!systemId) return { success: false };

        const data = await request.formData();
        const barcodesStr = data.get('barcodes');

        if (barcodesStr) {
            try {
                const barcodes = JSON.parse(barcodesStr);
                for (const barcode of barcodes) {
                    await db.triggerLedByBarcode(systemId, barcode, true);
                }
                
                setTimeout(async () => {
                    try { await db.createHardwareCommand(systemId, [0]); } catch(e){}
                }, 10000);
                
                return { success: true };
            } catch(e) {
                console.error("Fehler beim LED Trigger:", e);
                return { success: false };
            }
        }
        return { success: false };
    },

    // 2. INVENTUR-SCHRITT 1: Fach für die Entnahme blinken lassen & Tara-Gewicht laden
    initMaintenance: async ({ request, locals }) => { // NEU: locals
        const systemId = locals.systemId;
        if (!systemId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        const barcode = data.get('barcode');

        try {
            // Wir brauchen das Leergewicht der Box für dieses Fach
            const drawer = await db.getDrawerByBarcode(systemId, barcode);
            if (!drawer || drawer.boxWeight == null) {
                return { success: false, error: 'Kein Leergewicht (Tara) für dieses Fach hinterlegt.' };
            }

            // Fach aufleuchten lassen für die Entnahme!
            await db.triggerLedByBarcode(systemId, barcode, true);
            
            // Nach 10 Sek automatisch ausschalten
            setTimeout(async () => {
                try { await db.createHardwareCommand(systemId, [0]); } catch(e){}
            }, 10000);

            return { success: true, boxWeight: drawer.boxWeight, barcode };
        } catch(e) {
            return { success: false, error: 'Datenbankfehler' };
        }
    },

    // 3. INVENTUR-SCHRITT 2: Waage starten
    requestScale: async ({ request, locals }) => { // NEU: locals
        const systemId = locals.systemId;
        if (!systemId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        const barcode = data.get('barcode');

        await new Promise(resolve => setTimeout(resolve, 1000));
        const requestId = await db.createScaleRequest(systemId, barcode);
        return { success: true, requestId };
    },

    // 4. INVENTUR-SCHRITT 3: Buchen und Fach für die Rückgabe blinken lassen
    bookInventory: async ({ request, locals }) => { // NEU: locals
        const systemId = locals.systemId;
        if (!systemId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');
        const newStock = parseInt(data.get('newStock'));

        try {
            // Bestand buchen (Dies setzt intern auch lastWeighedAt und lastReturnedAt)
            await db.updateArticleStockFromWeights(systemId, articleId, barcode, newStock);
            
            // Fach ERNEUT aufleuchten lassen für das Einlagern!
            await db.triggerLedByBarcode(systemId, barcode, true);
            
            setTimeout(async () => {
                try { await db.createHardwareCommand(systemId, [0]); } catch(e){}
            }, 10000);

            return { success: true };
        } catch (err) {
            return { success: false, error: 'Buchungsfehler' };
        }
    }
};