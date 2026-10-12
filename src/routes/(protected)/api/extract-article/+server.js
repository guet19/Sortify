import { json } from '@sveltejs/kit';
import { generateJson, aiErrorMessage } from '$lib/server/gemini.js';
import db from '$lib/server/db.js';

// Obergrenzen gegen Kostenmissbrauch der KI-API
const MAX_INPUT_CHARS = 200_000;
const AI_CALLS_PER_HOUR = 60;

export async function POST({ request, locals }) {
    try {
        const { html, expectedAttributes, images: rawImages } = await request.json();

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


        const prompt = `
Hier sind die erwarteten Attribute, die du extrahieren sollst:
${JSON.stringify(expectedAttributes, null, 2)}

Erwartetes JSON-Format:
{
    "title": "Produktname",
    "description": "Zusammenfassung...",
    "supplier": "Shopname",
    "gtin": "7611123456789",
    "price": 12.50,
    "totalPackPrice": null,
    "packQuantity": null,
    "specs": { "ID": "Wert" },
    "finalImageUrl": "" 
}

Bild-Kandidaten (URL – Alt-Text):
${images.length ? images.map(i => `- ${i.url} – ${i.alt || 'ohne Alt-Text'}`).join('\n') : 'keine'}

Extrahierte Shop-Daten:
${html}
        `;

        const { data: extractedData, model: aiModel } = await generateJson({
            contents: prompt,
            config: {
                systemInstruction: `Du bist ein technischer Daten-Extraktor. Extrahiere Produktdaten präzise im JSON-Format.
REGELN:
1. TITEL: Sauberer Artikelname inkl. relevanter Dimensionen (z.B. "5 x 60 mm"). WICHTIG: Entferne zwingend alle Verpackungseinheiten, Stückzahlen, Gewichte oder Mengen (z.B. "| 50 Stück", "10er Pack", "Inhalt: 20") aus dem Titel!
2. BESCHREIBUNG: Schreibe 2-4 informative Sätze basierend auf dem Text. Hebe Besonderheiten hervor.
3. PREIS & MENGE: Wenn es ein Multipack ist (z.B. '12 x 15g', '50 Stück'), rechne die Gesamtstückzahl aus und trage sie in 'packQuantity' ein. Den Gesamtpreis in 'totalPackPrice'. Bei Einzelartikeln nur 'price'.
4. GTIN/EAN: Suche nach GTIN oder Herstellernummern.
5. ZAHLEN: Bei "ui_type": "number" IMMER nur die nackte Zahl antworten (keine Einheiten!).
6. LIEFERANT: Name des Online-Shops (aus dem Text ableiten).
7. QUELLEN: Wenn "PRODUKTDATEN (JSON-LD)" vorhanden sind, haben sie Vorrang (name, description, gtin13/gtin/mpn/sku, offers.price, brand). Technische Werte bevorzugt aus "TABELLEN".
8. BILD: Wähle aus den Bild-Kandidaten das beste Hauptproduktbild (das Produkt selbst, möglichst groß und freigestellt – keine Logos, Icons, Banner, Zahlungsarten oder Zubehör anderer Produkte). Gib dessen URL exakt so in "finalImageUrl" zurück. Gibt es keinen passenden Kandidaten, lass das Feld leer.
GIB AUSSCHLIESSLICH DAS JSON ZURÜCK! Keine Begrüßung, keine Erklärungen.`,
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
        return json({ error: aiErrorMessage(error, 'Fehler beim Analysieren der Artikeldaten.') }, { status: 502 });
    }
}