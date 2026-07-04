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
    // 1. Manueller Trigger (nur schauen, wo das Fach ist)
    triggerLED: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return { success: false };

        const data = await request.formData();
        const barcodesStr = data.get('barcodes');

        if (barcodesStr) {
            try {
                const barcodes = JSON.parse(barcodesStr);
                for (const barcode of barcodes) {
                    await db.triggerLedByBarcode(userId, barcode, true);
                }
                
                setTimeout(async () => {
                    try { await db.createHardwareCommand(userId, [0]); } catch(e){}
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
    initMaintenance: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        const data = await request.formData();
        const barcode = data.get('barcode');

        try {
            // Wir brauchen das Leergewicht der Box für dieses Fach
            const drawer = await db.getDrawerByBarcode(userId, barcode);
            if (!drawer || drawer.boxWeight == null) {
                return { success: false, error: 'Kein Leergewicht (Tara) für dieses Fach hinterlegt.' };
            }

            // Fach aufleuchten lassen für die Entnahme!
            await db.triggerLedByBarcode(userId, barcode, true);
            
            // Nach 10 Sek automatisch ausschalten
            setTimeout(async () => {
                try { await db.createHardwareCommand(userId, [0]); } catch(e){}
            }, 10000);

            return { success: true, boxWeight: drawer.boxWeight, barcode };
        } catch(e) {
            return { success: false, error: 'Datenbankfehler' };
        }
    },

    // 3. INVENTUR-SCHRITT 2: Waage starten
    requestScale: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        const data = await request.formData();
        const barcode = data.get('barcode');

        await new Promise(resolve => setTimeout(resolve, 1000));
        const requestId = await db.createScaleRequest(userId, barcode);
        return { success: true, requestId };
    },

    // 4. INVENTUR-SCHRITT 3: Buchen und Fach für die Rückgabe blinken lassen
    bookInventory: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        const data = await request.formData();
        
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');
        const newStock = parseInt(data.get('newStock'));

        try {
            // Bestand buchen (Dies setzt intern auch lastWeighedAt und lastReturnedAt)
            await db.updateArticleStockFromWeights(userId, articleId, barcode, newStock);
            
            // Fach ERNEUT aufleuchten lassen für das Einlagern!
            await db.triggerLedByBarcode(userId, barcode, true);
            
            setTimeout(async () => {
                try { await db.createHardwareCommand(userId, [0]); } catch(e){}
            }, 10000);

            return { success: true };
        } catch (err) {
            return { success: false, error: 'Buchungsfehler' };
        }
    }
};