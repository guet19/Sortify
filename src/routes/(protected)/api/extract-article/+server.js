import { json } from '@sveltejs/kit';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';

export async function POST({ request }) {
    try {
        const { html, expectedAttributes } = await request.json();

        if (!html) {
            return json({ error: 'Keine Daten empfangen.' }, { status: 400 });
        }

        if (!env.GEMINI_API_KEY) {
            return json({ error: 'API-Schlüssel fehlt auf dem Server.' }, { status: 500 });
        }

        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

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

Extrahierte Shop-Daten:
${html}
        `;

        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
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
GIB AUSSCHLIESSLICH DAS JSON ZURÜCK! Keine Begrüßung, keine Erklärungen.`,
                responseMimeType: "application/json",
                temperature: 0.1
            }
        });

        let aiResponseText = result.text;
        
        const match = aiResponseText.match(/\{[\s\S]*\}/);
        if (!match) {
            throw new Error("KI hat kein gültiges JSON-Objekt zurückgegeben.");
        }
        
        const extractedData = JSON.parse(match[0]);
        return json(extractedData);

    } catch (error) {
        console.error("❌ FATALER FEHLER IM BACKEND:", error);
        return json({ error: 'Fehler beim Analysieren der Artikeldaten', details: error.message }, { status: 500 });
    }
}