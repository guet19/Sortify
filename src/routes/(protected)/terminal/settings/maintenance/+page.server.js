import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';

// 🔥 Speichert Timeouts pro User, damit diese sich nicht gegenseitig stören
const activeUserTimeouts = new Map();

export async function load({ locals }) { 
    const systemId = locals.systemId;
    if (!systemId) throw redirect(303, '/login');

    const articles = await db.getArticles(systemId).catch(() => []);
    
    return {
        articles: JSON.parse(JSON.stringify(articles))
    };
}

export const actions = {
    // 1. Manueller Trigger (nur schauen, wo das Fach ist)
    triggerLED: async ({ request, locals }) => { 
        const systemId = locals.systemId;
        const userColor = locals.color || '#3b82f6';
        const userKey = locals.userId || userColor; 
        
        if (!systemId) return { success: false };

        const data = await request.formData();
        const barcodesStr = data.get('barcodes');

        if (barcodesStr) {
            try {
                const barcodes = JSON.parse(barcodesStr);
                
                // 🔥 NEU: Alles synchron aufleuchten lassen in User-Farbe
                await db.triggerLedsByBarcodeArray(systemId, barcodes, userColor);
                
                // Alten Timer des Users löschen
                if (activeUserTimeouts.has(userKey)) {
                    clearTimeout(activeUserTimeouts.get(userKey));
                }
                
                // Neuen Timer setzen: Nur DIESE Barcodes wieder auf Schwarz setzen
                const timeoutId = setTimeout(async () => {
                    try { await db.triggerLedsByBarcodeArray(systemId, barcodes, '#000000'); } catch(e){}
                    activeUserTimeouts.delete(userKey);
                }, 10000);
                
                activeUserTimeouts.set(userKey, timeoutId);
                
                return { success: true };
            } catch(e) {
                console.error("Fehler beim LED Trigger:", e);
                return { success: false };
            }
        }
        return { success: false };
    },

    // 2. INVENTUR-SCHRITT 1: Fach für die Entnahme blinken lassen & Tara-Gewicht laden
    initMaintenance: async ({ request, locals }) => { 
        const systemId = locals.systemId;
        const userColor = locals.color || '#3b82f6';
        const userKey = locals.userId || userColor; 
        
        if (!systemId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        const barcode = data.get('barcode');

        try {
            // Wir brauchen das Leergewicht der Box für dieses Fach
            const drawer = await db.getDrawerByBarcode(systemId, barcode);
            if (!drawer || drawer.boxWeight == null) {
                return { success: false, error: 'Kein Leergewicht (Tara) für dieses Fach hinterlegt.' };
            }

            // 🔥 NEU: Fach aufleuchten lassen für die Entnahme (Barcode als Array verpackt)
            await db.triggerLedsByBarcodeArray(systemId, [barcode], userColor);
            
            if (activeUserTimeouts.has(userKey)) {
                clearTimeout(activeUserTimeouts.get(userKey));
            }
            
            // Nach 10 Sek gezielt ausschalten
            const timeoutId = setTimeout(async () => {
                try { await db.triggerLedsByBarcodeArray(systemId, [barcode], '#000000'); } catch(e){}
                activeUserTimeouts.delete(userKey);
            }, 10000);
            
            activeUserTimeouts.set(userKey, timeoutId);

            return { success: true, boxWeight: drawer.boxWeight, barcode };
        } catch(e) {
            return { success: false, error: 'Datenbankfehler' };
        }
    },

    // 3. INVENTUR-SCHRITT 2: Waage starten (bleibt unverändert)
    requestScale: async ({ request, locals }) => { 
        const systemId = locals.systemId;
        if (!systemId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        const barcode = data.get('barcode');

        await new Promise(resolve => setTimeout(resolve, 1000));
        const requestId = await db.createScaleRequest(systemId, barcode);
        return { success: true, requestId };
    },

    // 4. INVENTUR-SCHRITT 3: Buchen und Fach für die Rückgabe blinken lassen
    bookInventory: async ({ request, locals }) => { 
        const systemId = locals.systemId;
        const userColor = locals.color || '#3b82f6';
        const userKey = locals.userId || userColor; 
        
        if (!systemId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');
        const newStock = parseInt(data.get('newStock'));

        try {
            // Bestand buchen (Dies setzt intern auch lastWeighedAt und lastReturnedAt)
            await db.updateArticleStockFromWeights(systemId, articleId, barcode, newStock);
            
            // 🔥 NEU: Fach ERNEUT aufleuchten lassen für das Einlagern!
            await db.triggerLedsByBarcodeArray(systemId, [barcode], userColor);
            
            if (activeUserTimeouts.has(userKey)) {
                clearTimeout(activeUserTimeouts.get(userKey));
            }
            
            // Gezielt ausschalten
            const timeoutId = setTimeout(async () => {
                try { await db.triggerLedsByBarcodeArray(systemId, [barcode], '#000000'); } catch(e){}
                activeUserTimeouts.delete(userKey);
            }, 10000);
            
            activeUserTimeouts.set(userKey, timeoutId);

            return { success: true };
        } catch (err) {
            return { success: false, error: 'Buchungsfehler' };
        }
    },
    
    // 🔥 Optionales Extra: Falls du in der Frontend-Maintenance-Ansicht 
    // auch `stopHardware()` beim Navigieren nutzen möchtest
    turnOffLED: async ({ request, locals }) => { 
        const systemId = locals.systemId;
        const userKey = locals.userId || locals.color || '#3b82f6';
        if (!systemId) return { success: false };

        const data = await request.formData();
        const barcodesStr = data.get('barcodes');

        try {
            if (activeUserTimeouts.has(userKey)) {
                clearTimeout(activeUserTimeouts.get(userKey));
                activeUserTimeouts.delete(userKey);
            }
            
            if (barcodesStr && barcodesStr !== '[]' && barcodesStr !== 'null') {
                const barcodes = JSON.parse(barcodesStr);
                await db.triggerLedsByBarcodeArray(systemId, barcodes, '#000000');
            }
            return { success: true };
        } catch (err) {
            return { success: false };
        }
    }
};