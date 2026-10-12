import { json } from '@sveltejs/kit';
import { generateJson, aiErrorMessage } from '$lib/server/gemini.js';
import db from '$lib/server/db.js';

const MAX_INPUT_CHARS = 8000;
const AI_CALLS_PER_HOUR = 60;
const MIN_CONFIDENCE = 0.5;

// Schlägt anhand der Shop-Daten eine BESTEHENDE Haupt- und Unterkategorie vor (erfindet keine neuen)
export async function POST({ request, locals }) {
    try {
        const { text } = await request.json();
        if (!text || typeof text !== 'string') {
            return json({ error: 'Keine Daten empfangen.' }, { status: 400 });
        }

        // Kategorien kommen aus der Datenbank, nicht vom Browser
        const categories = (await db.getCategories(locals.systemId))
            .filter(c => Array.isArray(c.subcategories) && c.subcategories.length > 0);
        if (categories.length === 0) return json({ suggestion: null });

        // Gemeinsames Kontingent mit den anderen KI-Funktionen
        const limit = await db.rateLimit(`ai:${locals.user.id}`, AI_CALLS_PER_HOUR, 60 * 60 * 1000);
        if (!limit.allowed) {
            return json({ error: `KI-Limit erreicht. Bitte in ${limit.retryAfterMinutes} Minute(n) erneut versuchen.` }, { status: 429 });
        }

        const categoryList = categories.map(c => ({
            id: c._id,
            name: c.name,
            subcategories: c.subcategories.map(s => ({ id: s.id, name: s.name }))
        }));

        // Einfache Zuordnung -> schnelle Lite-Modelle zuerst
        const { data: answer, model: aiModel } = await generateJson({
            prefer: 'fast',
            timeoutMs: 15_000,
            deadlineMs: 30_000,
            contents: `Verfügbare Kategorien (nur diese sind erlaubt):
${JSON.stringify(categoryList)}

Produktdaten von der Shop-Seite:
${text.slice(0, MAX_INPUT_CHARS)}`,
            config: {
                systemInstruction: `Du ordnest Produkte einer Lagerverwaltung zu.
Wähle die am besten passende Hauptkategorie und eine Unterkategorie, die zu GENAU dieser Hauptkategorie gehört.
Verwende ausschliesslich IDs aus der Liste. Erfinde keine neuen Kategorien.
"confidence" ist deine Sicherheit von 0 bis 1. Passt keine Kategorie wirklich, gib null-IDs und confidence 0 zurück.
Antworte nur als JSON: {"mainCategoryId": "...", "subcategoryId": "...", "confidence": 0.0}`,
                temperature: 0
            }
        });

        // Nur gültige Kombinationen aus der eigenen Kategorienliste übernehmen
        const main = categories.find(c => c._id === answer.mainCategoryId);
        const sub = main?.subcategories.find(s => s.id === answer.subcategoryId);
        const confidence = Number(answer.confidence) || 0;
        if (!main || !sub || confidence < MIN_CONFIDENCE) return json({ suggestion: null, aiModel });

        return json({ suggestion: { mainCategoryId: main._id, subcategoryId: sub.id, confidence }, aiModel });
    } catch (error) {
        console.error("Fehler beim Kategorie-Vorschlag:", error);
        return json({ error: aiErrorMessage(error, 'Kategorie konnte nicht ermittelt werden.') }, { status: 502 });
    }
}
