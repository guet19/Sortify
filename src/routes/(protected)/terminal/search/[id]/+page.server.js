import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';

const activeUserTimeouts = new Map();

export async function load({ locals, params }) { 
    const systemId = locals.systemId;
    if (!systemId) throw redirect(303, '/login');

    const articleId = params.id;
    const categories = await db.getCategories(systemId).catch(() => []);
    const attributes = await db.getFilterAttributes(systemId).catch(() => []); 
    
    let article = null;
    try {
        article = await db.getArticleById(systemId, articleId);
    } catch (e) {
        console.error("🔴 Fehler beim Laden des Artikels:", e);
    }

    if (!article) {
        throw redirect(303, '/terminal/search');
    }

    return {
        article: JSON.parse(JSON.stringify(article)),
        categories: JSON.parse(JSON.stringify(categories)),
        attributes: JSON.parse(JSON.stringify(attributes))
    };
}

export const actions = {
    triggerLED: async ({ request, locals }) => { 
        const systemId = locals.systemId;
        const userColor = locals.color || '#3b82f6'; 
        const userKey = locals.userId || userColor; 

        if (!systemId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        const barcodesStr = data.get('barcodes');

        if (!barcodesStr || barcodesStr === '[]' || barcodesStr === 'null') {
            return { success: false, error: 'Keine Barcodes zugewiesen' };
        }

        try {
            const barcodes = JSON.parse(barcodesStr);

            // 🔥 FIX: Keine for-Schleife mehr! Ein Befehl für alle Barcodes.
            await db.triggerLedsByBarcodeArray(systemId, barcodes, userColor);
            console.log(`💡 SAMMEL-Trigger: ${barcodes.length} Barcodes -> Farbe: ${userColor} | User: ${userKey}`);

            if (activeUserTimeouts.has(userKey)) {
                clearTimeout(activeUserTimeouts.get(userKey));
            }

            const timeoutId = setTimeout(async () => {
                try {
                    // 🔥 FIX: Auch beim Ausschalten feuern wir alles gebündelt ab
                    await db.triggerLedsByBarcodeArray(systemId, barcodes, '#000000');
                    console.log(`⏱️ 10s Timeout: LEDs für User ${userKey} gezielt ausgeschaltet.`);
                } catch (e) {
                    console.error("Fehler beim automatischen Ausschalten der LED:", e);
                }
                activeUserTimeouts.delete(userKey);
            }, 10000); 

            activeUserTimeouts.set(userKey, timeoutId);

            return { success: true };
        } catch (err) {
            console.error("🔴 Fehler beim LED Trigger:", err);
            return { success: false, error: 'Hardwarefehler' };
        }
    },

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
                // 🔥 FIX: Bündeln für das manuelle Ausschalten (beim Navigieren)
                await db.triggerLedsByBarcodeArray(systemId, barcodes, '#000000');
            }
            return { success: true };
        } catch (err) {
            return { success: false };
        }
    }
};