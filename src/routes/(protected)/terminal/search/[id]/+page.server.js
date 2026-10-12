import { redirect, fail } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import db from '$lib/server/db.js';
import { lightUpArticle, turnOffArticle, getArticleBarcodes } from '$lib/server/leds.js';

export async function load({ locals, params }) { 
    const systemId = locals.systemId;
    if (!systemId) throw redirect(303, '/login');
    if (!ObjectId.isValid(params.id)) throw redirect(303, '/terminal/search');

    // Unabhängige Abfragen parallel statt nacheinander
    const [article, categories, attributes] = await Promise.all([
        db.getArticleById(systemId, params.id),
        db.getCategories(systemId).catch(() => []),
        db.getFilterAttributes(systemId).catch(() => [])
    ]);

    // Im Terminal gibt es nur eingelagerte Artikel
    if (!article || getArticleBarcodes(article).length === 0) {
        throw redirect(303, '/terminal/search');
    }

    return {
        article: JSON.parse(JSON.stringify(article)),
        categories: JSON.parse(JSON.stringify(categories)),
        attributes: JSON.parse(JSON.stringify(attributes)),
        userColor: locals.color || '#3b82f6'
    };
}

// Gleiche Aktionen wie auf der Artikelseite (/[id]) – die Fächer ermittelt der Server selbst
export const actions = {
    lightUp: async ({ params, locals }) => {
        if (!locals.systemId || !ObjectId.isValid(params.id)) return fail(400, { ledError: 'Ungültiger Artikel.' });
        try {
            const result = await lightUpArticle(locals.systemId, params.id, locals.color || '#3b82f6', locals.user.id);
            return result.success ? result : fail(400, { ledError: result.error });
        } catch (err) {
            console.error("🔴 Fehler beim LED Trigger:", err);
            return fail(500, { ledError: 'Das Regal konnte nicht angesteuert werden.' });
        }
    },

    turnOffLED: async ({ params, locals }) => {
        if (!locals.systemId || !ObjectId.isValid(params.id)) return { success: false };
        try {
            return await turnOffArticle(locals.systemId, params.id, locals.user.id);
        } catch (err) {
            return { success: false };
        }
    }
};
