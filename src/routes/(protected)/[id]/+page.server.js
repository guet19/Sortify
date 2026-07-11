import db from '$lib/server/db.js';
import { error } from '@sveltejs/kit';
import { ObjectId } from 'mongodb'; // 🔥 NEU: Import hinzugefügt

export async function load({ params, locals }) { 
    // 1. Die System-ID aus dem Rucksack (locals) holen
    const systemId = locals.systemId;
    
    if (!systemId) {
        throw error(401, 'Kein aktives Lager ausgewählt');
    }

    // 2. Die Artikel-ID aus der URL auslesen
    const articleId = params.id;

    // 🔥 NEUER CHECK: Ist die ID in der URL überhaupt eine gültige 24-stellige MongoDB-ID?
    // Falls das Wort z.B. "einstellungen" lautet, wird hier sofort abgebrochen (404),
    // BEVOR die Datenbank mit einem BSON-Error abstürzt.
    if (!ObjectId.isValid(articleId)) {
        throw error(404, {
            message: 'Dieser Artikel existiert nicht (Ungültige ID).'
        });
    }

    // 3. Den spezifischen Artikel MIT der systemId aus der Datenbank holen
    const article = await db.getArticleById(systemId, articleId);

    // 4. Fehlerbehandlung: Wenn der Artikel nicht existiert oder nicht zum Lager gehört
    if (!article) {
        throw error(404, {
            message: 'Dieser Artikel wurde nicht gefunden oder gehört nicht zu diesem Lager.'
        });
    }

    // 5. Metadaten für das aktuelle Lager laden
    const categories = await db.getCategories(systemId);
    const attributes = await db.getFilterAttributes(systemId);

    // 6. JSON-Parsen für das POJO-Problem von SvelteKit
    return {
        article: JSON.parse(JSON.stringify(article)),
        categories: JSON.parse(JSON.stringify(categories)),
        attributes: JSON.parse(JSON.stringify(attributes))
    };
}

// --- Action für das Speichern des Bestandes ---
export const actions = {
    updateStock: async ({ request, locals }) => { 
        // 1. System-ID zwingend aus locals laden
        const systemId = locals.systemId;
        if (!systemId) {
            return { success: false, error: 'Kein aktives Lager ausgewählt' };
        }

        // 2. Daten aus dem Frontend-Formular abfangen
        const data = await request.formData();
        const articleId = data.get('articleId');
        const newStock = parseInt(data.get('newStock'), 10);

        // Sicherheitsprüfung des Wertes
        if (isNaN(newStock) || newStock < 0) {
            return { success: false, error: 'Ungültiger Bestand' };
        }
        
        // 🔥 ZUSATZ-CHECK: Auch beim Speichern absichern
        if (!ObjectId.isValid(articleId)) {
            return { success: false, error: 'Ungültige Artikel-ID' };
        }

        try {
            // 3. Update-Funktion mit der neuen systemId aufrufen
            await db.updateArticle(systemId, articleId, { istBestand: newStock });

            return { success: true };
        } catch (err) {
            console.error("Fehler beim Aktualisieren des Bestandes:", err);
            return { success: false, error: "Bestand konnte nicht gespeichert werden." };
        }
    }
};