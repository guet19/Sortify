import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';

// Globaler Timer für die LED, damit wir ihn sicher handhaben können
let globalLedTimeout = null;

export async function load({ locals, params }) { // NEU: locals statt cookies
    const systemId = locals.systemId;
    if (!systemId) throw redirect(303, '/login');

    const articleId = params.id;

    // Alle Datenabfragen streng über die neue systemId filtern
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

    // POJO-Fix für die fehlerfreie Übergabe an das SvelteKit-Frontend
    return {
        article: JSON.parse(JSON.stringify(article)),
        categories: JSON.parse(JSON.stringify(categories)),
        attributes: JSON.parse(JSON.stringify(attributes))
    };
}

export const actions = {
    // Action zum Auslösen der Pick-by-Light Hardware
    triggerLED: async ({ request, locals }) => { // NEU: locals statt cookies
        const systemId = locals.systemId;
        if (!systemId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        const barcodesStr = data.get('barcodes');

        if (!barcodesStr || barcodesStr === '[]' || barcodesStr === 'null') {
            return { success: false, error: 'Keine Barcodes zugewiesen' };
        }

        try {
            // String wieder in ein echtes JavaScript-Array umwandeln
            const barcodes = JSON.parse(barcodesStr);

            // Alle Barcodes durchlaufen und anpingen (jetzt mit der systemId)
            for (const barcode of barcodes) {
                const triggeredIndex = await db.triggerLedByBarcode(systemId, barcode);
                console.log(`💡 LED-Trigger gesendet! Barcode: ${barcode} -> LED Index: #${triggeredIndex}`);
            }

            // Falls noch ein alter Ausschalt-Timer läuft, löschen wir ihn
            if (globalLedTimeout) {
                clearTimeout(globalLedTimeout);
                globalLedTimeout = null;
            }

            // Der 10-Sekunden Timer zum automatischen Ausschalten im richtigen System Kontext
            globalLedTimeout = setTimeout(async () => {
                try {
                    // Befehl 0 schaltet auf dem Controller alle aktiven LEDs des Systems aus
                    await db.createHardwareCommand(systemId, 0);
                    console.log(`⏱️ 10 Sekunden um. LEDs für ${barcodes.length} Fächer automatisch ausgeschaltet.`);
                } catch (e) {
                    console.error("Fehler beim automatischen Ausschalten der LED:", e);
                }
                globalLedTimeout = null;
            }, 10000); 

            return { success: true };
        } catch (err) {
            console.error("🔴 Fehler beim LED Trigger:", err);
            return { success: false, error: 'Hardwarefehler' };
        }
    },

    // Action zum sofortigen Ausschalten (wird genutzt, wenn der User die Seite verlässt)
    turnOffLED: async ({ locals }) => { // NEU: locals statt cookies
        const systemId = locals.systemId;
        if (!systemId) return { success: false };

        try {
            if (globalLedTimeout) {
                clearTimeout(globalLedTimeout);
                globalLedTimeout = null;
            }
            await db.createHardwareCommand(systemId, 0);
            return { success: true };
        } catch (err) {
            return { success: false };
        }
    }
};