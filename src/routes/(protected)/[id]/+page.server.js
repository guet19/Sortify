import db from '$lib/server/db.js';
import { error } from '@sveltejs/kit';

export async function load({ params, cookies }) {
    // 1. Die ID des aktuell eingeloggten Nutzers aus dem Cookie auslesen
    const userId = cookies.get('session');
    
    // (Optionaler Sicherheits-Check, falls jemand den Layout-Schutz umgeht)
    if (!userId) {
        throw error(401, 'Nicht autorisiert');
    }

    // 2. Die Artikel-ID aus der URL auslesen
    const articleId = params.id;

    // 3. WICHTIG: Den spezifischen Artikel MIT der userId aus der Datenbank holen
    const article = await db.getArticleById(userId, articleId);

    // 4. Fehlerbehandlung: Wenn es die ID nicht gibt oder sie NICHT diesem User gehört
    if (!article) {
        throw error(404, {
            message: 'Dieser Artikel wurde nicht gefunden oder du hast keinen Zugriff darauf.'
        });
    }

    // 5. Metadaten laden (ebenfalls streng an den User gebunden!)
    const categories = await db.getCategories(userId);
    const attributes = await db.getFilterAttributes(userId);

    // 6. Alles "entschärft" an das Frontend (+page.svelte) übergeben
    return {
        article: JSON.parse(JSON.stringify(article)),
        categories: JSON.parse(JSON.stringify(categories)),
        attributes: JSON.parse(JSON.stringify(attributes))
    };
}

// --- Action für das Speichern des Bestandes ---
export const actions = {
    updateStock: async ({ request, cookies }) => {
        // 1. Auch hier benötigen wir zwingend die ID des Nutzers!
        const userId = cookies.get('session');
        if (!userId) {
            return { success: false, error: 'Nicht autorisiert' };
        }

        // 2. Daten aus dem Frontend-Formular abfangen
        const data = await request.formData();
        const articleId = data.get('articleId');
        const newStock = parseInt(data.get('newStock'), 10);

        // Sicherheitsprüfung des Wertes
        if (isNaN(newStock) || newStock < 0) {
            return { success: false, error: 'Ungültiger Bestand' };
        }

        try {
            // 3. WICHTIG: Die Update-Funktion fordert nun als Erstes die userId.
            // Dadurch ist es unmöglich, dass ein Nutzer per Manipulation 
            // den Bestand des Artikels eines fremden Nutzers ändert.
            await db.updateArticle(userId, articleId, { istBestand: newStock });

            return { success: true };
        } catch (err) {
            console.error("Fehler beim Aktualisieren des Bestandes:", err);
            return { success: false, error: "Bestand konnte nicht gespeichert werden." };
        }
    }
};