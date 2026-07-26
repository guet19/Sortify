import { json } from '@sveltejs/kit';
import * as cheerio from 'cheerio';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';

// Initialisiere die KI mit dem Key aus deiner .env Datei
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export async function POST({ request }) {
    try {
        const { articleText, categories, attributes } = await request.json();
        let promptContext = articleText;

        // Prüfen, ob die Eingabe ein Web-Link ist
        if (articleText.startsWith('http://') || articleText.startsWith('https://')) {
            try {
                // Webseite im Hintergrund abrufen
                const webResponse = await fetch(articleText, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });
                
                const html = await webResponse.text();
                
                // HTML elegant und sicher mit Cheerio parsen
                const $ = cheerio.load(html);
                
                const title = $('title').text().trim();
                const h1 = $('h1').first().text().trim();
                const description = $('meta[name="description"]').attr('content')?.trim() || '';

                promptContext = `
                    Ich habe einen Web-Link ausgelesen. Hier sind die Produktdaten von der Website:
                    - Seitentitel: ${title}
                    - Artikel-Überschrift (H1): ${h1}
                    - Beschreibung: ${description}
                `;
            } catch (e) {
                console.error("Konnte Webseite nicht mit Cheerio auslesen:", e);
                // Fallback, falls die Seite komplett blockiert
                promptContext = `Hier ist eine URL zu einem Artikel: ${articleText}`;
            }
        }

        const prompt = `
            Du bist ein Profi für die Strukturierung einer Lagerverwaltung.
            Der Benutzer möchte diesen Artikel anlegen:
            "${promptContext}"

            Bestehende Hauptkategorien:
            ${JSON.stringify(categories.map(c => ({ id: c._id, name: c.name, subs: c.subcategories?.map(s => ({ id: s.id, name: s.name })) })))}

            Bestehende Filter-Attribute:
            ${JSON.stringify(attributes.map(a => ({ id: a._id, label: a.label, options: a.options })))}

            AUFGABE:
            1. Ordne den Artikel zu. Nutze IDs, wenn es perfekt passt (isNew: false). Erfinde neue, wenn nichts passt (isNew: true).
            2. Suche 1-3 bestehende Filter-IDs, die gut zu diesem Artikel passen.
            3. Schlage 1-3 NEUE, sehr nützliche Filter vor (mit sinnvollen Dropdown-Optionen), die es noch nicht gibt.

            Antworte AUSSCHLIESSLICH im folgenden JSON-Format (kein Markdown, keine Backticks):
            {
              "mainCategory": { "isNew": true, "id": "ID_Oder_Null", "suggestedName": "Kategorie Name" },
              "subCategory": { "isNew": true, "id": "ID_Oder_Null", "suggestedName": "Unterkategorie Name" },
              "existingAttributeIds": ["id1"],
              "newAttributes": [
                { "label": "Eigenschaft", "ui_type": "select", "unit": "", "options": ["Option 1", "Option 2"] }
              ]
            }
        `;

        // Aufruf der KI über das neue SDK (@google/genai)
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                // Zwingt die KI dazu, ein sauberes JSON-Objekt zurückzugeben
                responseMimeType: "application/json",
            }
        });

        // JSON-String der KI parsen
        const aiData = JSON.parse(response.text);

        return json(aiData);

    } catch (error) {
        console.error("KI Fehler:", error);
        return json({ error: 'Fehler bei der KI-Generierung' }, { status: 500 });
    }
}