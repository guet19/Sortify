import { json } from '@sveltejs/kit';
import { generateJson, aiErrorMessage, canRetryFast } from '$lib/server/gemini.js';
import db from '$lib/server/db.js';
import { extractPrompt, EXTRACT_INSTRUCTION } from '$lib/server/articleExtract.js';

// Obergrenzen gegen Kostenmissbrauch der KI-API
const MAX_INPUT_CHARS = 200_000;
const AI_CALLS_PER_HOUR = 60;

export async function POST({ request, locals }) {
    const startedAt = Date.now();
    let prefer = 'best'; // 'fast' = Zweitversuch nach Zeitüberschreitung
    try {
        // hint: Hinweis des Nutzers, z.B. welche Variante einer Seite gemeint ist
        const { html, expectedAttributes, images: rawImages, fast, hint } = await request.json();
        if (fast === true) prefer = 'fast';

        // Bild-Kandidaten vom Lesezeichen (nur http/https, begrenzt)
        const images = (Array.isArray(rawImages) ? rawImages : [])
            .filter(i => typeof i?.url === 'string' && /^https?:\/\//i.test(i.url))
            .slice(0, 24)
            .map(i => ({ url: i.url.slice(0, 2000), alt: String(i.alt || '').slice(0, 80) }));

        if (!html || typeof html !== 'string') {
            return json({ error: 'Keine Daten empfangen.' }, { status: 400 });
        }
        if (html.length > MAX_INPUT_CHARS) {
            return json({ error: 'Die Seite ist zu groß für die Analyse.' }, { status: 413 });
        }

        const limit = await db.rateLimit(`ai:${locals.user.id}`, AI_CALLS_PER_HOUR, 60 * 60 * 1000);
        if (!limit.allowed) {
            return json({ error: `KI-Limit erreicht. Bitte in ${limit.retryAfterMinutes} Minute(n) erneut versuchen.` }, { status: 429 });
        }


        const prompt = extractPrompt({ expectedAttributes, images, html, hint });

        const { data: extractedData, model: aiModel } = await generateJson({
            prefer,
            startedAt,
            contents: prompt,
            config: {
                systemInstruction: EXTRACT_INSTRUCTION,
                temperature: 0.1
            }
        });

        // Nur Bilder akzeptieren, die tatsächlich von der Seite stammen
        if (!images.some(i => i.url === extractedData.finalImageUrl)) {
            extractedData.finalImageUrl = '';
        }
        return json({ ...extractedData, aiModel });

    } catch (error) {
        console.error("❌ FATALER FEHLER IM BACKEND:", error);
        return json({ error: aiErrorMessage(error, 'Fehler beim Analysieren der Artikeldaten.'), canRetryFast: canRetryFast(error, prefer) }, { status: 502 });
    }
}