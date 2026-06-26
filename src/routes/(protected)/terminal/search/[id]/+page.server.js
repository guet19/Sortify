import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';

export async function load({ cookies, params }) {
    const session = cookies.get('session');
    if (!session) throw redirect(303, '/login');

    const articleId = params.id;

    const categories = await db.getCategories(session).catch(() => []);
    const attributes = await db.getFilterAttributes(session).catch(() => []); 
    
    let article = null;
    try {
        article = await db.getArticleById(session, articleId);
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
    // Action zum Auslösen der Pick-by-Light Hardware
    triggerLED: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        const barcode = data.get('barcode');

        if (!barcode || barcode === 'null' || barcode === '') {
            return { success: false, error: 'Kein Barcode zugewiesen' };
        }

        try {
            const triggeredIndex = await db.triggerLedByBarcode(userId, barcode);
            console.log(`💡 LED-Trigger gesendet! Barcode: ${barcode} -> LED Index: #${triggeredIndex}`);

            // NEU: Der 10-Sekunden Timer zum automatischen Ausschalten
            setTimeout(async () => {
                try {
                    await db.createHardwareCommand(userId, 0);
                    console.log(`⏱️ 10 Sekunden um. LED für Barcode ${barcode} automatisch ausgeschaltet.`);
                } catch (e) {
                    console.error("Fehler beim automatischen Ausschalten der LED:", e);
                }
            }, 10000); // 10000 ms = 10 Sekunden

            return { success: true };
        } catch (err) {
            console.error("🔴 Fehler beim LED Trigger:", err);
            return { success: false, error: 'Hardwarefehler' };
        }
    },

    // NEU: Action zum sofortigen Ausschalten (wird genutzt, wenn der User die Seite verlässt)
    turnOffLED: async ({ cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return { success: false };

        try {
            await db.createHardwareCommand(userId, 0);
            return { success: true };
        } catch (err) {
            return { success: false };
        }
    }
};