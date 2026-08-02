import { json } from '@sveltejs/kit';
import * as cheerio from 'cheerio';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export async function POST({ request }) {
    try {
        const { articleText, categories, attributes } = await request.json();
        let promptContext = articleText;

        console.log("🚀 KI Struktur-Assistent gestartet...");

        // Prüfen, ob die Eingabe ein Web-Link ist
        if (articleText.startsWith('http://') || articleText.startsWith('https://')) {
            try {
                const webResponse = await fetch(articleText, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });
                
                const html = await webResponse.text();
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
                console.log("✅ Webseite erfolgreich ausgelesen.");
            } catch (e) {
                console.warn("⚠️ Konnte Webseite nicht mit Cheerio auslesen, nutze Fallback.", e.message);
                promptContext = `Hier ist eine URL zu einem Artikel: ${articleText}`;
            }
        }

        const prompt = `
            Du bist ein Profi für die Strukturierung einer Lagerverwaltung.
            Der Benutzer möchte diesen Artikel anlegen:
            "${promptContext}"

            Bestehende Hauptkategorien (inklusive ihrer Unterkategorien und deren bereits zugewiesenen Filtern "allowed_attributes"):
            ${JSON.stringify(categories.map(c => ({ 
                id: c._id, 
                name: c.name, 
                subs: c.subcategories?.map(s => ({ 
                    id: s.id, 
                    name: s.name,
                    allowed_attributes: s.allowed_attributes || []
                })) 
            })))}

            Bestehende Filter-Attribute im gesamten System:
            ${JSON.stringify(attributes.map(a => ({ id: a._id, label: a.label, options: a.options })))}

            AUFGABE UND REGELN:
            1. KATEGORISIERUNG: Ordne den Artikel zu. Nutze IDs, wenn es perfekt passt (isNew: false). Erfinde neue, wenn nichts passt (isNew: true).
            2. BESTEHENDE FILTER:
               - Wenn du dich für eine BESTEHENDE Unterkategorie entscheidest, MUSS das Array "existingAttributeIds" ZWINGEND alle IDs enthalten, die im "allowed_attributes" Array dieser Unterkategorie stehen.
               - Suche ZUSÄTZLICH in den "Bestehenden Filter-Attributen", ob es weitere Filter gibt, die für diesen speziellen Artikel relevant sind, und füge deren IDs ebenfalls dem Array "existingAttributeIds" hinzu.
            3. NEUE FILTER (VERBOT VON SYNONYMEN):
               - Schlage 0-2 NEUE Filter vor.
               - ACHTUNG: Du darfst NIEMALS ein neues Attribut erfinden, wenn ein inhaltlich gleiches oder ähnliches Attribut bereits existiert (z.B. erfinde kein "Max. Arbeitstemperatur", wenn es "max. Temperaturbereich" schon gibt). Suche stattdessen die ID des bestehenden Attributs!

            Antworte AUSSCHLIESSLICH im folgenden JSON-Format (kein Markdown, keine Backticks):
            {
              "mainCategory": { "isNew": true, "id": "ID_Oder_Null", "suggestedName": "Kategorie Name" },
              "subCategory": { "isNew": true, "id": "ID_Oder_Null", "suggestedName": "Unterkategorie Name" },
              "existingAttributeIds": ["id1", "id2", "id3"],
              "newAttributes": [
                { "label": "Eigenschaft", "ui_type": "select", "unit": "", "options": ["Option 1", "Option 2"] }
              ]
            }
        `;

        console.log("🤖 Rufe Gemini auf...");
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
            }
        });

        const rawText = response.text;
        
        // 🔥 FIX 1: JSON sicher extrahieren (ignoriert Markdown-Blöcke)
        const match = rawText.match(/\{[\s\S]*\}/);
        if (!match) {
            console.error("❌ Fehler: KI hat kein gültiges JSON-Objekt generiert! Rohdaten:", rawText);
            throw new Error("KI hat kein gültiges JSON-Objekt zurückgegeben.");
        }

        const aiData = JSON.parse(match[0]);

        // 🔥 FIX 2: Sichere Suche nach "Marke" (verhindert Absturz, falls label undefiniert ist)
        const markeAttr = attributes.find(a => a.label && a.label.toLowerCase() === 'marke');
        if (markeAttr) {
            if (!aiData.existingAttributeIds) {
                aiData.existingAttributeIds = [];
            }
            if (!aiData.existingAttributeIds.includes(markeAttr._id)) {
                aiData.existingAttributeIds.push(markeAttr._id);
                console.log("🏷️ Marke-Filter wurde automatisch ergänzt.");
            }
        }

        console.log("✅ Analyse erfolgreich abgeschlossen.");
        return json(aiData);

    } catch (error) {
        console.error("❌ FATALER KI Fehler:", error);
        return json({ error: 'Fehler bei der KI-Generierung', details: error.message }, { status: 500 });
    }
}