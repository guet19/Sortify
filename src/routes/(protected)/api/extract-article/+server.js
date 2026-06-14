import { json } from '@sveltejs/kit';
import * as cheerio from 'cheerio';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';

export async function POST({ request }) {
    try {
        const { html, url, expectedAttributes } = await request.json();

        // --- DIAGNOSE LOGS START ---
        console.log("\n====================================");
        console.log("🚀 NEUER KI-IMPORT GESTARTET (MODERNES SDK)");
        console.log("🔗 URL:", url || "KEINE URL ÜBERGEBEN");
        console.log("📦 Länge Payload (html):", html ? html.length : "LEER");
        console.log("📄 Erste 100 Zeichen Payload:", html ? html.substring(0, 100).replace(/\n/g, ' ') : "-");
        console.log("====================================\n");
        // --- DIAGNOSE LOGS ENDE ---

        if (!html && !url) {
            console.log("❌ Abbruch: Weder HTML noch URL empfangen.");
            return json({ error: 'Keine Daten empfangen.' }, { status: 400 });
        }

        if (!env.GEMINI_API_KEY) {
            console.error("❌ KRITISCHER FEHLER: GEMINI_API_KEY fehlt in den Umgebungsvariablen (.env)!");
            return json({ error: 'API-Schlüssel fehlt auf dem Server.' }, { status: 500 });
        }

        let contentToParse = "";
        let useFallbackText = false;
        let fallbackText = html || "";

        // 1. VERSUCH: Echte Webseite im Backend herunterladen
        if (url) {
            try {
                console.log(`🌐 Versuche URL herunterzuladen...`);
                const fetchRes = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml'
                    }
                });
                
                if (fetchRes.ok) {
                    contentToParse = await fetchRes.text();
                    console.log(`✅ Download erfolgreich (${contentToParse.length} Zeichen geladen).`);
                } else {
                    console.warn(`⚠️ Fetch vom Shop blockiert (HTTP Status ${fetchRes.status}). Nutze stattdessen Bookmarklet-Daten.`);
                    useFallbackText = true;
                }
            } catch (e) {
                console.warn(`⚠️ Fetch komplett fehlgeschlagen (${e.message}). Nutze stattdessen Bookmarklet-Daten.`);
                useFallbackText = true;
            }
        } else {
            contentToParse = fallbackText;
            if (!contentToParse.includes('<html') && !contentToParse.includes('<body')) {
                useFallbackText = true;
            }
        }

        let finalTextToAnalyze = "";
        let manualImageUrl = "";

        // 2. DATEN AUFBEREITEN
        if (!useFallbackText && contentToParse) {
            const $ = cheerio.load(contentToParse);
            
            manualImageUrl = $('meta[property="og:image"]').attr('content') 
                            || $('meta[name="twitter:image"]').attr('content')
                            || $('img').not('header img, footer img, .icon img').first().attr('src');

            let jsonLdText = "";
            $('script[type="application/ld+json"]').each((_, el) => {
                jsonLdText += $(el).html() + " \n";
            });

            $('script, style, nav, footer, header, noscript, svg, iframe').remove();
            const cleanText = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 15000);

            finalTextToAnalyze = `Versteckte Shop-Daten (JSON-LD):\n${jsonLdText}\n\nSichtbarer Webseiten-Text:\n${cleanText}`;
            console.log("🧩 HTML sauber geparst. Sende aufbereitete Daten an Gemini...");
        } else {
            finalTextToAnalyze = `Extrahierte Bookmarklet-Daten:\n${fallbackText}`;
            console.log("♻️ Nutze Bookmarklet-Fallback. Sende Kurz-Text an Gemini...");
        }

        // 3. KI AUFRUF (Neues `@google/genai` SDK v1)
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
    "finalImageUrl": "${manualImageUrl || ''}" 
}

URL: ${url}
Inhalt:
${finalTextToAnalyze}
        `;

        console.log("🤖 Sende Anfrage an gemini-2.5-flash...");
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
6. LIEFERANT: Name des Online-Shops (aus der URL ableiten).
GIB AUSSCHLIESSLICH DAS JSON ZURÜCK! Keine Begrüßung, keine Erklärungen.`,
                responseMimeType: "application/json",
                temperature: 0.1
            }
});
        let aiResponseText = result.text;
        
        // --- DIAGNOSE LOGS KI ANTWORT ---
        console.log("\n🤖 KI ANTWORT (Rohdaten):");
        console.log(aiResponseText);
        console.log("====================================\n");

        const match = aiResponseText.match(/\{[\s\S]*\}/);
        if (!match) {
            console.error("❌ Fehler: KI hat kein gültiges JSON-Objekt generiert!");
            throw new Error("KI hat kein gültiges JSON-Objekt zurückgegeben.");
        }
        
        const extractedData = JSON.parse(match[0]);
        
        if (extractedData.finalImageUrl && extractedData.finalImageUrl.startsWith('/')) {
            try {
                const urlObj = new URL(url);
                extractedData.finalImageUrl = `${urlObj.origin}${extractedData.finalImageUrl}`;
            } catch (e) {
                console.warn("⚠️ Konnte Basis-URL für das Bild nicht parsen:", url);
            }
        }
        
        console.log("✅ Extraktion erfolgreich abgeschlossen. Daten gehen ans Frontend!");
        return json(extractedData);

    } catch (error) {
        console.error("❌ FATALER FEHLER IM BACKEND:", error);
        return json({ error: 'Fehler beim Analysieren der Artikeldaten', details: error.message }, { status: 500 });
    }
}