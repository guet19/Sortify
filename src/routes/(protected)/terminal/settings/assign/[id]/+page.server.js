import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { actor } from '$lib/server/actor.js';
import { scheduleLedsOff, cancelLedsOff } from '$lib/server/leds.js';
import { scaleTarget } from '$lib/server/devices.js';

export async function load({ locals, params }) { 
    const systemId = locals.systemId;
    if (!systemId) throw redirect(303, '/login');

    const articleId = params.id;
    // Unabhängige Abfragen parallel statt nacheinander
    const [categories, attributes] = await Promise.all([
        db.getCategories(systemId).catch(() => []),
        db.getFilterAttributes(systemId).catch(() => [])
    ]);
    
    let article = await db.getArticleById(systemId, articleId).catch(() => null);
    if (!article) throw redirect(303, '/terminal/settings/assign');

    return {
        article: JSON.parse(JSON.stringify(article)),
        categories: JSON.parse(JSON.stringify(categories)),
        attributes: JSON.parse(JSON.stringify(attributes))
    };
}

export const actions = {
    // Lässt alle freien Fächer blau leuchten
    lightUpEmptySlots: async ({ request, locals }) => { 
        const systemId = locals.systemId;
        if (!systemId) return { success: false };

        const data = await request.formData();
        // 🔥 Farbe aus dem Frontend übernehmen (Fallback auf Blau)
        const customColor = data.get('color') || '#0000FF';

        try {
            cancelLedsOff(systemId);

            // 🔥 Zuerst alle bestehenden Lichter ausschalten!
            await db.createHardwareCommand(systemId, [0]);
            await new Promise(resolve => setTimeout(resolve, 100));

            // Übergebe die Farbe an die Funktion in der db.js
            if (typeof db.triggerEmptyLedsBlue === 'function') {
                await db.triggerEmptyLedsBlue(systemId, customColor);
            }

            scheduleLedsOff(systemId, 15000);

            return { success: true };
        } catch (err) {
            console.error("Fehler beim blauen Aufleuchten:", err);
            return { success: false };
        }
    },

    checkBarcode: async ({ request, locals, params }) => {
        const systemId = locals.systemId;
        if (!systemId) return { success: false, error: 'Unauthorized' };

        const currentArticleId = params.id;
        const data = await request.formData();
        let barcode = data.get('barcode');
        
        // 🔥 Farbe auslesen (ist Blau, wenn es vom Frontend gesendet wird)
        const customColor = data.get('color') || '#0000FF';

        if (!barcode) {
            return { success: false, error: 'Fehlende Daten' };
        }

        barcode = String(barcode).trim();

        try {
            const duplicateArticle = await db.getArticleByBarcode(systemId, barcode);
            
            if (duplicateArticle && String(duplicateArticle._id) !== String(currentArticleId)) {
                const safeArticle = JSON.parse(JSON.stringify(duplicateArticle));
                return { success: false, error: 'already_assigned', conflictingArticle: safeArticle, barcode };
            }

            const barcodeExists = await db.checkIfBarcodeExists(systemId, barcode);

            if (!barcodeExists) {
                return { success: false, error: 'not_in_shelves' };
            }

            cancelLedsOff(systemId);
            
            // 🔥 Schalte alle vorherigen "leeren" Fächer restlos aus
            await db.createHardwareCommand(systemId, [0]);
            await new Promise(resolve => setTimeout(resolve, 100));

            // 🔥 Wir nutzen hier einfach unsere bewährte Funktion, da wir wissen, 
            // dass sie den customColor Parameter (Blau) perfekt verarbeitet!
            if (typeof db.triggerLedByBarcode === 'function') {
                await db.triggerLedByBarcode(systemId, barcode, customColor);
            } else if (typeof db.triggerSingleLedBlue === 'function') {
                await db.triggerSingleLedBlue(systemId, barcode, customColor);
            }

            // Verlängerter Timer (30s)
            scheduleLedsOff(systemId, 30000);

            return { success: true, barcode };
        } catch (err) {
            return { success: false, error: 'Datenbankfehler' };
        }
    },

    requestScale: async ({ locals, cookies }) => {
        const systemId = locals.systemId;
        if (!systemId) return { success: false };

        try {
            // Gewogen wird an der Waage des Terminals, an dem dieser Browser steht
            const target = await scaleTarget(systemId, cookies);
            if (target.error) return { success: false, error: target.error };
            const requestId = await db.createScaleRequest(systemId, "setup", { deviceId: target.deviceId });
            return { success: true, requestId };
        } catch (err) {
            return { success: false, error: 'Waage nicht erreichbar' };
        }
    },

    saveAll: async ({ request, locals }) => {
        const systemId = locals.systemId;
        const data = await request.formData();
        
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');
        
        const boxWeight = parseFloat(data.get('boxWeight'));
        const itemWeight = parseFloat(data.get('itemWeight'));

        try {
            await db.assignBarcodeAndWeights(systemId, articleId, barcode, boxWeight, itemWeight, actor(locals, 'terminal-zuweisung'));
            return { success: true };
        } catch (err) {
            return { success: false, error: 'Fehler beim Speichern' };
        }
    },

    unlinkBarcode: async ({ request, locals }) => {
        const systemId = locals.systemId;
        const data = await request.formData();
        
        const articleId = data.get('articleId');
        const barcode = data.get('barcode'); 
        
        try {
            await db.removeBarcodes(systemId, articleId, barcode, actor(locals, 'terminal-zuweisung'));
            return { success: true };
        } catch (err) {
            return { success: false };
        }
    },

    triggerLedOnly: async ({ request, locals }) => {
        const systemId = locals.systemId;
        const data = await request.formData();
        const barcode = data.get('barcode');
        // 🔥 Nimm Blau, falls gesendet, ansonsten die User-Farbe
        const customColor = data.get('color') || locals.color || '#0000FF';
        
        try {
            cancelLedsOff(systemId);

            // Alle alten Lichter ausmachen
            await db.createHardwareCommand(systemId, [0]);
            await new Promise(resolve => setTimeout(resolve, 100));

            // 🔥 Farbe als String übergeben, statt "true"
            await db.triggerLedByBarcode(systemId, barcode, customColor);
            
            scheduleLedsOff(systemId, 10000);

            return { success: true };
        } catch (err) {
            return { success: false };
        }
    },

    updateStockAndLightUp: async ({ request, locals }) => {
        const systemId = locals.systemId;
        const data = await request.formData();
        
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');
        const newStock = parseInt(data.get('newStock'));
        
        // Hier nutzen wir wieder die Standard-Farbe des Users (z.B. Grün beim Einlagern)
        const userColor = locals.color || '#3b82f6';

        try {
            await db.updateArticleStockFromWeights(systemId, articleId, barcode, newStock, actor(locals, 'terminal-zuweisung'));
            
            cancelLedsOff(systemId);

            // Lichter aus
            await db.createHardwareCommand(systemId, [0]);
            await new Promise(resolve => setTimeout(resolve, 100));

            // Fach in der User-Farbe (für den erfolgreichen Abschluss) aufleuchten lassen
            await db.triggerLedByBarcode(systemId, barcode, userColor);
            
            scheduleLedsOff(systemId, 10000);

            return { success: true };
        } catch (err) {
            return { success: false, error: 'Buchungsfehler' };
        }
    },

    saveWeightAndAllStocks: async ({ request, locals }) => {
        const systemId = locals.systemId;
        const data = await request.formData();
        
        const articleId = data.get('articleId');
        const itemWeight = parseFloat(data.get('itemWeight'));
        const slotsDataStr = data.get('slotsData');

        try {
            await db.updateArticleItemWeight(systemId, articleId, itemWeight);
            
            if (slotsDataStr) {
                const slotsData = JSON.parse(slotsDataStr);
                for (const slot of slotsData) {
                    await db.updateArticleStockFromWeights(systemId, articleId, slot.barcode, slot.newStock, actor(locals, 'terminal-zuweisung'));
                }
            }

            cancelLedsOff(systemId);
            try { await db.createHardwareCommand(systemId, [0]); } catch(e){}

            return { success: true };
        } catch (err) {
            console.error("Fehler beim Sammelspeichern:", err);
            return { success: false, error: 'Speicherfehler bei der Sammelbuchung' };
        }
    }
};