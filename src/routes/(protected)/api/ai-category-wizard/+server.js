import { json } from '@sveltejs/kit';
import * as cheerio from 'cheerio';
import { generateJson, aiErrorMessage, canRetryFast } from '$lib/server/gemini.js';
import { safeFetch, readLimited } from '$lib/server/security.js';
import db from '$lib/server/db.js';

// Obergrenzen gegen Kostenmissbrauch der KI-API
const MAX_INPUT_CHARS = 20_000;
const AI_CALLS_PER_HOUR = 60;
const UI_TYPES = ['select', 'number', 'text'];

const normalize = (s) => String(s || '').trim().toLowerCase();

// Liest bei einem eingegebenen Link die wichtigsten Produktdaten der Seite aus
async function readProductPage(link) {
    const webResponse = await safeFetch(link, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    const html = (await readLimited(webResponse, 2 * 1024 * 1024)).toString('utf8');
    const $ = cheerio.load(html);

    const jsonLd = $('script[type="application/ld+json"]').map((_, el) => $(el).text()).get()
        .filter(t => t.includes('Product')).join(' ').slice(0, 8000);
    const tables = $('table, dl').map((_, el) => $(el).text()).get().join(' | ').replace(/\s+/g, ' ').slice(0, 5000);

    return [
        `Seitentitel: ${$('title').text().trim()}`,
        `Überschrift: ${$('h1').first().text().trim()}`,
        `Beschreibung: ${$('meta[name="description"]').attr('content')?.trim() || ''}`,
        jsonLd ? `Produktdaten (JSON-LD): ${jsonLd}` : '',
        tables ? `Tabellen: ${tables}` : ''
    ].filter(Boolean).join('\n');
}

export async function POST({ request, locals }) {
    const startedAt = Date.now();
    let prefer = 'best'; // 'fast' = Zweitversuch nach Zeitüberschreitung
    try {
        const { articleText, avoid, fast } = await request.json();
        if (fast === true) prefer = 'fast';

        if (!articleText || typeof articleText !== 'string' || articleText.length > MAX_INPUT_CHARS) {
            return json({ error: `Bitte gib einen Text oder Link mit max. ${MAX_INPUT_CHARS} Zeichen ein.` }, { status: 400 });
        }

        // Gemeinsames Kontingent mit dem Artikel-Import
        const limit = await db.rateLimit(`ai:${locals.user.id}`, AI_CALLS_PER_HOUR, 60 * 60 * 1000);
        if (!limit.allowed) {
            return json({ error: `KI-Limit erreicht. Bitte in ${limit.retryAfterMinutes} Minute(n) erneut versuchen.` }, { status: 429 });
        }

        // Kategorien und Filter kommen aus der Datenbank, nicht vom Browser
        const [categories, attributes] = await Promise.all([
            db.getCategories(locals.systemId),
            db.getFilterAttributes(locals.systemId)
        ]);

        // Vom Nutzer abgelehnte Zuordnung (z.B. KI-Vorschlag beim Artikel anlegen)
        const avoidMain = categories.find(c => c._id === avoid?.mainCategoryId);
        const avoidSub = avoidMain?.subcategories?.find(s => s.id === avoid?.subcategoryId);
        const avoidHint = avoidMain && avoidSub
            ? `WICHTIG: Der Benutzer ist mit der Zuordnung "${avoidMain.name} > ${avoidSub.name}" (Unterkategorie-ID ${avoidSub.id}) NICHT einverstanden. Wähle diese Unterkategorie nicht. Schlage eine andere bestehende Unterkategorie vor, wenn sie wirklich besser passt – sonst eine neue, passendere Unterkategorie (gerne innerhalb einer passenden bestehenden Hauptkategorie).`
            : '';

        let promptContext = articleText;
        if (/^https?:\/\//i.test(articleText.trim())) {
            try {
                promptContext = await readProductPage(articleText.trim());
            } catch (e) {
                console.warn("⚠️ Webseite konnte nicht ausgelesen werden, nutze nur den Link.", e.message);
                promptContext = `Hier ist eine URL zu einem Artikel: ${articleText}`;
            }
        }

        const prompt = `
            Du bist ein Profi für die Strukturierung einer Lagerverwaltung.
            Der Benutzer möchte diesen Artikel anlegen:
            """
            ${promptContext}
            """

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
            ${JSON.stringify(attributes.map(a => ({ id: a._id, label: a.label, ui_type: a.ui_type, unit: a.unit, options: a.options })))}

            ${avoidHint}

            AUFGABE UND REGELN:
            1. KATEGORISIERUNG: Ordne den Artikel zu. Nutze bestehende IDs, wenn es passt (isNew: false) – auch wenn der Name nicht exakt gleich ist (z.B. "Schrauben" für eine Spanplattenschraube). Erfinde nur dann neue Kategorien (isNew: true), wenn wirklich nichts passt. Eine bestehende Unterkategorie darf nur zusammen mit IHRER Hauptkategorie gewählt werden.
            2. NAMEN: Neue Kategorienamen sind kurz, allgemein und im Plural (z.B. "Holzschrauben", nicht "Spanplattenschraube Torx 4x40").
            3. BESTEHENDE FILTER:
               - Wenn du dich für eine BESTEHENDE Unterkategorie entscheidest, MUSS das Array "existingAttributeIds" ZWINGEND alle IDs enthalten, die im "allowed_attributes" Array dieser Unterkategorie stehen.
               - Suche ZUSÄTZLICH in den "Bestehenden Filter-Attributen", ob es weitere Filter gibt, die für diesen speziellen Artikel relevant sind, und füge deren IDs ebenfalls hinzu.
            4. NEUE FILTER (VERBOT VON SYNONYMEN):
               - Schlage 0-4 NEUE Filter vor, die für das Suchen und Unterscheiden solcher Artikel im Lager wirklich nützlich sind (z.B. Durchmesser, Länge, Material) – keine Preise, Artikelnummern oder Marketingtexte.
               - ACHTUNG: Erfinde NIEMALS ein neues Attribut, wenn ein inhaltlich gleiches oder ähnliches Attribut bereits existiert (z.B. kein "Max. Arbeitstemperatur", wenn es "max. Temperaturbereich" schon gibt). Nutze stattdessen dessen ID!
               - "ui_type" ist "number" für messbare Werte (dann mit "unit", z.B. "mm"), sonst "select" mit 2-8 sinnvollen Optionen.

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

        const { data: aiData, model: aiModel } = await generateJson({ prefer, startedAt, contents: prompt, config: { temperature: 0.2 } });

        // --- Antwort gegen die echten Daten prüfen und bereinigen ---
        const mainIn = aiData.mainCategory || {};
        const subIn = aiData.subCategory || {};

        // Hauptkategorie: ID muss existieren, ein "neuer" Name darf nicht schon vergeben sein
        let mainCat = !mainIn.isNew ? categories.find(c => c._id === mainIn.id) : null;
        if (!mainCat && mainIn.suggestedName) mainCat = categories.find(c => normalize(c.name) === normalize(mainIn.suggestedName));
        const mainCategory = mainCat
            ? { isNew: false, id: mainCat._id, suggestedName: mainCat.name }
            : { isNew: true, id: null, suggestedName: String(mainIn.suggestedName || '').trim().slice(0, 60) };

        // Unterkategorie: nur innerhalb der gewählten Hauptkategorie gültig
        const subs = mainCat?.subcategories || [];
        let subCat = !subIn.isNew ? subs.find(s => s.id === subIn.id) : null;
        if (!subCat && subIn.suggestedName) subCat = subs.find(s => normalize(s.name) === normalize(subIn.suggestedName));
        const subCategory = subCat
            ? { isNew: false, id: subCat.id, suggestedName: subCat.name }
            : { isNew: true, id: null, suggestedName: String(subIn.suggestedName || '').trim().slice(0, 60) };

        // Bestehende Filter: nur echte IDs, plus alle Filter der gewählten Unterkategorie
        const attributeIds = new Set(attributes.map(a => a._id));
        const existingAttributeIds = new Set(
            (Array.isArray(aiData.existingAttributeIds) ? aiData.existingAttributeIds : []).filter(id => attributeIds.has(id))
        );
        (subCat?.allowed_attributes || []).forEach(id => { if (attributeIds.has(id)) existingAttributeIds.add(id); });

        // Neue Filter: gültiger Typ, keine Dubletten – existiert der Name schon, wird der bestehende Filter genutzt
        const newAttributes = [];
        const seenLabels = new Set();
        for (const attr of (Array.isArray(aiData.newAttributes) ? aiData.newAttributes : []).slice(0, 6)) {
            const label = String(attr?.label || '').trim().slice(0, 60);
            if (!label || seenLabels.has(normalize(label))) continue;
            seenLabels.add(normalize(label));

            const existing = attributes.find(a => normalize(a.label) === normalize(label));
            if (existing) { existingAttributeIds.add(existing._id); continue; }

            const ui_type = UI_TYPES.includes(attr.ui_type) ? attr.ui_type : 'select';
            newAttributes.push({
                label,
                ui_type,
                unit: ui_type === 'number' ? String(attr.unit || '').trim().slice(0, 15) : '',
                options: ui_type === 'select' ? (Array.isArray(attr.options) ? attr.options : []).map(o => String(o).trim().slice(0, 60)).filter(Boolean).slice(0, 30) : []
            });
        }

        // Der Filter "Marke" ist immer sinnvoll, falls vorhanden
        const brandAttr = attributes.find(a => normalize(a.label) === 'marke');
        if (brandAttr) existingAttributeIds.add(brandAttr._id);

        return json({ mainCategory, subCategory, existingAttributeIds: [...existingAttributeIds], newAttributes, aiModel });

    } catch (error) {
        console.error("❌ KI-Fehler im Kategorie-Assistenten:", error);
        return json({ error: aiErrorMessage(error), canRetryFast: canRetryFast(error, prefer) }, { status: 502 });
    }
}
