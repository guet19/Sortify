// KI-Artikelimport (Lesezeichen): Anweisung und Anfrage an die KI.
// Eigene Datei, damit sich der Aufbau ohne KI-Aufruf testen lässt.

export const MAX_HINT_CHARS = 300;

// Hinweis des Nutzers, z.B. "M3 x 10 mm, 100 Stück" (welche Variante einer Seite gemeint ist)
export function cleanHint(hint) {
    return String(hint ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_HINT_CHARS);
}

export const EXTRACT_INSTRUCTION = `Du bist ein technischer Daten-Extraktor. Extrahiere Produktdaten präzise im JSON-Format.
REGELN:
1. TITEL: Sauberer Artikelname inkl. relevanter Dimensionen (z.B. "5 x 60 mm"). WICHTIG: Entferne zwingend alle Verpackungseinheiten, Stückzahlen, Gewichte oder Mengen (z.B. "| 50 Stück", "10er Pack", "Inhalt: 20") aus dem Titel!
2. BESCHREIBUNG: Schreibe 2-4 informative Sätze basierend auf dem Text. Hebe Besonderheiten hervor.
3. PREIS & MENGE: Wenn es ein Multipack ist (z.B. '12 x 15g', '50 Stück'), rechne die Gesamtstückzahl aus und trage sie in 'packQuantity' ein. Den Gesamtpreis in 'totalPackPrice'. Bei Einzelartikeln nur 'price'.
4. GTIN/EAN: Suche nach GTIN oder Herstellernummern.
5. ZAHLEN: Bei "ui_type": "number" IMMER nur die nackte Zahl antworten (keine Einheiten!).
6. LIEFERANT: Name des Online-Shops (aus dem Text ableiten).
7. QUELLEN: Wenn "PRODUKTDATEN (JSON-LD)" vorhanden sind, haben sie Vorrang (name, description, gtin13/gtin/mpn/sku, offers.price, brand). Technische Werte bevorzugt aus "TABELLEN".
8. BILD: Wähle aus den Bild-Kandidaten das beste Hauptproduktbild (das Produkt selbst, möglichst groß und freigestellt – keine Logos, Icons, Banner, Zahlungsarten oder Zubehör anderer Produkte). Gib dessen URL exakt so in "finalImageUrl" zurück. Gibt es keinen passenden Kandidaten, lass das Feld leer.
9. VARIANTEN: Bietet die Seite mehrere Varianten an (z.B. Grösse, Länge, Menge, Farbe), beziehe ALLE Angaben – Titel, Beschreibung, Preis, Packungsmenge, Bild und Attribute – auf genau eine Variante: die aus "HINWEIS DES NUTZERS", sonst die auf der Seite erkennbar ausgewählte. Steht der Preis dieser Variante nicht eindeutig im Text, lass "price" und "totalPackPrice" leer statt zu raten. Weitere Wünsche im Hinweis befolgst du, soweit sie diese Datenfelder betreffen.
GIB AUSSCHLIESSLICH DAS JSON ZURÜCK! Keine Begrüßung, keine Erklärungen.`;

export function extractPrompt({ expectedAttributes = [], images = [], html = '', hint = '' }) {
    const wish = cleanHint(hint);
    return `
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
${wish ? `
HINWEIS DES NUTZERS (hat Vorrang; gemeint ist genau diese Variante bzw. dieser Wunsch):
${wish}
` : ''}
Bild-Kandidaten (URL – Alt-Text):
${images.length ? images.map(i => `- ${i.url} – ${i.alt || 'ohne Alt-Text'}`).join('\n') : 'keine'}

Extrahierte Shop-Daten:
${html}
        `;
}
