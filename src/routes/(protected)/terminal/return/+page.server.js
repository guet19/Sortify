import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';

// 🔥 NEU: Globaler Timer für die LED, damit wir ihn sicher abbrechen können!
let globalLedTimeout = null;

export async function load({ cookies }) {
    const session = cookies.get('session');
    if (!session) throw redirect(303, '/login');

    const articles = await db.getArticles(session).catch(() => []);
    
    return {
        articles: JSON.parse(JSON.stringify(articles))
    };
}

export const actions = {
    scanForReturn: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        const barcode = data.get('barcode');

        if (!barcode || barcode.trim() === '') {
            return { success: false, error: 'invalid_barcode' };
        }

        try {
            const article = await db.getArticleByBarcode(userId, barcode);
            const drawer = await db.getDrawerByBarcode(userId, barcode);

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

    requestScale: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        const data = await request.formData();
        const barcode = data.get('barcode');

        await new Promise(resolve => setTimeout(resolve, 1000));
        const requestId = await db.createScaleRequest(userId, barcode);
        return { success: true, requestId };
    },

    bookReturn: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        const data = await request.formData();
        
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');
        const newDrawerStock = parseInt(data.get('newStock'));

        if (!articleId || !barcode || isNaN(newDrawerStock)) {
            return { success: false, error: 'Fehlende Buchungsdaten' };
        }

        try {
            // Bestand buchen (setzt intern lastWeighedAt und lastReturnedAt)
            await db.updateArticleStockFromWeights(userId, articleId, barcode, newDrawerStock);
            
            // 🔥 Sicherer LED-Trigger mit Aufräum-Funktion
            if (globalLedTimeout) {
                clearTimeout(globalLedTimeout);
                globalLedTimeout = null;
            }
            await db.triggerLedByBarcode(userId, barcode, true);
            
            globalLedTimeout = setTimeout(async () => {
                try { await db.createHardwareCommand(userId, [0]); } catch (e) {}
                globalLedTimeout = null;
            }, 10000);

            return { success: true, step: 'done' };
        } catch (err) {
            console.error("🔴 Fehler in Action bookReturn:", err);
            return { success: false, error: 'Buchungsfehler' };
        }
    },

    // Direktes Einlagern ohne Waage (Wiegen überspringen)
    returnWithoutWeighing: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return { success: false };

        const data = await request.formData();
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');

        if (!articleId || !barcode) {
            return { success: false, error: 'Fehlende Daten' };
        }

        try {
            // Nur den Zeitstempel für die Retoure aktualisieren, da nicht gewogen wurde!
            await db.logArticleAction(userId, articleId, 'return');
            
            // 🔥 Sicherer LED-Trigger mit Aufräum-Funktion
            if (globalLedTimeout) {
                clearTimeout(globalLedTimeout);
                globalLedTimeout = null;
            }
            await db.triggerLedByBarcode(userId, barcode, true);
            
            globalLedTimeout = setTimeout(async () => {
                try { await db.createHardwareCommand(userId, [0]); } catch (e) {}
                globalLedTimeout = null;
            }, 10000);

            return { success: true, step: 'done' };
        } catch (err) {
            console.error("🔴 Fehler in Action returnWithoutWeighing:", err);
            return { success: false };
        }
    },

    // Löscht ein komplett leeres Fach bei der Retoure 
    bookAndUnlink: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        const data = await request.formData();
        
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');

        try {
            // 1. Bestand sicherheitshalber auf 0 buchen, damit die DB sauber ist
            await db.updateArticleStockFromWeights(userId, articleId, barcode, 0);
            
            // 2. Barcode komplett vom Artikel lösen (Fach freigeben)
            await db.removeBarcodes(userId, articleId, barcode);

            // 3. LED leuchten lassen, damit der User die entleerte Box entnehmen kann
            if (globalLedTimeout) {
                clearTimeout(globalLedTimeout);
                globalLedTimeout = null;
            }
            await db.triggerLedByBarcode(userId, barcode, true);
            
            globalLedTimeout = setTimeout(async () => {
                try { await db.createHardwareCommand(userId, [0]); } catch(e){}
                globalLedTimeout = null;
            }, 10000);

            // "unlinked: true" sagt dem Frontend, dass wir den roten Erfolgs-Screen anzeigen sollen
            return { success: true, step: 'done', unlinked: true };
        } catch (err) {
            console.error("Fehler beim Freigeben des leeren Fachs:", err);
            return { success: false, error: 'Fehler beim Freigeben' };
        }
    },

    // 🔥 NEU: Die Action für den "💡 Erneut leuchten" Button!
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
    }
};