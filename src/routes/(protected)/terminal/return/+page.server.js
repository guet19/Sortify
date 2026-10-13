import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { actor } from '$lib/server/actor.js';
import { scheduleLedsOff, cancelLedsOff } from '$lib/server/leds.js';

export async function load({ locals }) { 
    const systemId = locals.systemId;
    
    // Wenn kein Lager ausgewählt ist, zurück zum Login/Systemauswahl
    if (!systemId) throw redirect(303, '/login');

    const articles = await db.getArticles(systemId).catch(() => []);
    
    return {
        articles: JSON.parse(JSON.stringify(articles)),
        // 🔥 NEU: Farbe auslesen und an das Frontend übergeben
        userColor: locals.color || '#3b82f6' 
    };
}

export const actions = {
    scanForReturn: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        const barcode = data.get('barcode');

        if (!barcode || barcode.trim() === '') {
            return { success: false, error: 'invalid_barcode' };
        }

        try {
            // Unabhängige Abfragen parallel statt nacheinander
            const [article, drawer] = await Promise.all([
                db.getArticleByBarcode(systemId, barcode),
                db.getDrawerByBarcode(systemId, barcode)
            ]);

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

    requestScale: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        const barcode = data.get('barcode');

        await new Promise(resolve => setTimeout(resolve, 1000));
        const requestId = await db.createScaleRequest(systemId, barcode);
        return { success: true, requestId };
    },

    bookReturn: async ({ request, locals }) => {
        const systemId = locals.systemId;
        // 🔥 NEU: Farbe aus dem Hook laden
        const userColor = locals.color || '#3b82f6';
        if (!systemId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');
        const newDrawerStock = parseInt(data.get('newStock'));

        if (!articleId || !barcode || isNaN(newDrawerStock)) {
            return { success: false, error: 'Fehlende Buchungsdaten' };
        }

        try {
            // Bestand buchen
            await db.updateArticleStockFromWeights(systemId, articleId, barcode, newDrawerStock, actor(locals, 'terminal-rueckgabe'));
            
            cancelLedsOff(systemId);
            // 🔥 NEU: userColor statt 'true' an die Hardware übergeben
            await db.triggerLedByBarcode(systemId, barcode, userColor);
            
            scheduleLedsOff(systemId, 10000);

            return { success: true, step: 'done' };
        } catch (err) {
            console.error("🔴 Fehler in Action bookReturn:", err);
            return { success: false, error: 'Buchungsfehler' };
        }
    },

    returnWithoutWeighing: async ({ request, locals }) => {
        const systemId = locals.systemId;
        // 🔥 NEU: Farbe aus dem Hook laden
        const userColor = locals.color || '#3b82f6';
        if (!systemId) return { success: false };

        const data = await request.formData();
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');

        if (!articleId || !barcode) {
            return { success: false, error: 'Fehlende Daten' };
        }

        try {
            await db.logArticleAction(systemId, articleId, 'return');
            
            cancelLedsOff(systemId);
            // 🔥 NEU: userColor statt 'true' an die Hardware übergeben
            await db.triggerLedByBarcode(systemId, barcode, userColor);
            
            scheduleLedsOff(systemId, 10000);

            return { success: true, step: 'done' };
        } catch (err) {
            console.error("🔴 Fehler in Action returnWithoutWeighing:", err);
            return { success: false };
        }
    },

    bookAndUnlink: async ({ request, locals }) => {
        const systemId = locals.systemId;
        // 🔥 NEU: Farbe aus dem Hook laden
        const userColor = locals.color || '#3b82f6';
        if (!systemId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');

        try {
            await db.updateArticleStockFromWeights(systemId, articleId, barcode, 0, actor(locals, 'terminal-fach-leer'));
            await db.removeBarcodes(systemId, articleId, barcode, actor(locals, 'terminal-fach-leer'));

            cancelLedsOff(systemId);
            // 🔥 NEU: userColor statt 'true' an die Hardware übergeben
            await db.triggerLedByBarcode(systemId, barcode, userColor);
            
            scheduleLedsOff(systemId, 10000);

            return { success: true, step: 'done', unlinked: true };
        } catch (err) {
            console.error("Fehler beim Freigeben des leeren Fachs:", err);
            return { success: false, error: 'Fehler beim Freigeben' };
        }
    },

    triggerLedOnly: async ({ request, locals }) => {
        const systemId = locals.systemId;
        // 🔥 NEU: Farbe aus dem Hook laden
        const userColor = locals.color || '#3b82f6';
        if (!systemId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        const barcode = data.get('barcode');
        
        try {
            cancelLedsOff(systemId);

            // 🔥 NEU: userColor statt 'true' an die Hardware übergeben
            await db.triggerLedByBarcode(systemId, barcode, userColor);
            
            scheduleLedsOff(systemId, 10000);

            return { success: true };
        } catch (err) {
            return { success: false };
        }
    }
};