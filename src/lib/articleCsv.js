// Spalten für CSV-Import/-Export von Artikeln und gemeinsame Prüfregeln (Browser-Vorschau & Server)
import { parseNumber, normalizeHeader } from './csv.js';

export const CSV_COLUMNS = [
    { key: 'Titel', required: true },
    { key: 'Hauptkategorie', required: true },
    { key: 'Unterkategorie', required: true },
    { key: 'Ist-Bestand', required: true },
    { key: 'Soll-Bestand' },
    { key: 'Mindestbestand' },
    { key: 'Lieferant' },
    { key: 'GTIN' },
    { key: 'Preis' },
    { key: 'Bestelllink' },
    { key: 'Beschreibung' }
];
export const MAX_IMPORT_ROWS = 1000;
const field = (row, label) => row[normalizeHeader(label)] ?? '';
const norm = (s) => String(s || '').trim().toLowerCase();

// Prüft importierte Zeilen. categories: Kategorien des Lagers.
// allowNewCategories: unbekannte Kategorien werden angelegt statt als Fehler gemeldet.
// existingGtins: GTINs, die es im Lager schon gibt (Dubletten werden übersprungen).
export function validateImportRows(rows, categories, { allowNewCategories = false, existingGtins = [] } = {}) {
    const seenGtins = new Set(existingGtins.map(norm).filter(Boolean));
    return rows.slice(0, MAX_IMPORT_ROWS).map((row, index) => {
        const errors = [];
        const title = field(row, 'Titel');
        const mainName = field(row, 'Hauptkategorie');
        const subName = field(row, 'Unterkategorie');
        const stock = parseNumber(field(row, 'Ist-Bestand'));
        const target = parseNumber(field(row, 'Soll-Bestand'));
        const min = parseNumber(field(row, 'Mindestbestand'));
        const price = parseNumber(field(row, 'Preis'));
        const gtin = field(row, 'GTIN');
        const orderLink = field(row, 'Bestelllink');

        if (!title) errors.push('Titel fehlt');
        if (title.length > 200) errors.push('Titel zu lang');
        if (!mainName || !subName) errors.push('Kategorie fehlt');
        if (stock === null || Number.isNaN(stock) || stock < 0) errors.push('Ist-Bestand ungültig');
        for (const [label, v] of [['Soll-Bestand', target], ['Mindestbestand', min], ['Preis', price]]) {
            if (Number.isNaN(v) || (v !== null && v < 0)) errors.push(`${label} ungültig`);
        }
        if (orderLink && !/^https?:\/\//i.test(orderLink)) errors.push('Bestelllink muss mit http(s) beginnen');

        const main = categories.find((c) => norm(c.name) === norm(mainName));
        const sub = main?.subcategories?.find((s) => norm(s.name) === norm(subName));
        if (mainName && subName && !sub && !allowNewCategories) errors.push(`Kategorie „${mainName} › ${subName}" existiert nicht`);

        let skipped = '';
        if (gtin) {
            if (seenGtins.has(norm(gtin))) skipped = 'GTIN existiert bereits';
            else seenGtins.add(norm(gtin));
        }

        return {
            line: index + 2, // Zeile in der Datei (1 = Kopfzeile)
            errors,
            skipped,
            newCategory: !sub && mainName && subName ? { main: !main, sub: true } : null,
            data: {
                title, description: field(row, 'Beschreibung'), supplier: field(row, 'Lieferant'), gtin, orderLink,
                istBestand: stock, sollBestand: target, mindestBestand: min, price,
                mainCategoryName: mainName, subcategoryName: subName,
                mainCategoryId: main?._id || null, subcategoryId: sub?.id || null
            }
        };
    });
}

// Artikel -> CSV-Zeilen (Export, mit Kopfzeile)
export function articlesToRows(articles, categories) {
    const header = [...CSV_COLUMNS.map((c) => c.key), 'Fächer'];
    const rows = articles.map((a) => {
        const main = categories.find((c) => String(c._id) === String(a.mainCategoryId));
        const sub = main?.subcategories?.find((s) => s.id === a.subcategoryId);
        const slots = Array.isArray(a.assigned_barcodes) ? a.assigned_barcodes.map((b) => (typeof b === 'object' ? b.barcode : b)) : [];
        const n = (v) => (v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','));
        return [a.title, main?.name || '', sub?.name || '', n(a.istBestand), n(a.sollBestand), n(a.mindestBestand),
            a.supplier || '', a.gtin || '', n(a.price), a.orderLink || '', a.description || '', slots.join(', ')];
    });
    return [header, ...rows];
}
