// Altdaten-Formate der Fach-Barcodes vereinheitlichen. Historisch gab es:
//   assigned_barcode: 'A-01'                       (ein Fach, String)
//   assigned_barcodes: ['A-01', 'A-02']            (mehrere Fächer, Strings)
//   assigned_barcodes: [{ barcode, stock, … }]     (aktuelles Format)
// Liefert das aktuelle Format oder null, wenn der Artikel schon passt.
export function normalizeArticleBarcodes(article) {
    const list = Array.isArray(article?.assigned_barcodes) ? article.assigned_barcodes : [];
    const legacyMain = typeof article?.assigned_barcode === 'string' ? article.assigned_barcode.trim() : '';
    const needsMigration = 'assigned_barcode' in (article || {}) || list.some((b) => typeof b !== 'object' || b === null);
    if (!needsMigration) return null;

    const barcodes = [];
    for (const b of list) {
        if (typeof b === 'string' && b.trim()) barcodes.push({ barcode: b.trim(), stock: 0 });
        else if (b && typeof b === 'object' && b.barcode) barcodes.push({ ...b, barcode: String(b.barcode).trim(), stock: parseFloat(b.stock) || 0 });
    }
    if (legacyMain && !barcodes.some((b) => b.barcode === legacyMain)) barcodes.unshift({ barcode: legacyMain, stock: 0 });

    const unique = barcodes.filter((b, i) => barcodes.findIndex((o) => o.barcode === b.barcode) === i);
    // Früher lag der ganze Bestand im einzigen Fach -> beim Hauptfach eintragen, Gesamtbestand bleibt gleich
    const total = parseFloat(article.istBestand) || 0;
    if (unique.length > 0 && total > 0 && unique.every((b) => b.stock === 0)) {
        const main = unique.find((b) => b.barcode === legacyMain) || unique[0];
        main.stock = total;
    }
    return unique;
}

// Fächer eines Artikels im aktuellen Format [{ barcode, stock, … }] – auch für Altdaten.
// Wird im Browser (Artikelseite) und auf dem Server (Bestandsänderung) gleich verwendet.
export function articleDrawers(article) {
    const list = normalizeArticleBarcodes(article) ?? (Array.isArray(article?.assigned_barcodes) ? article.assigned_barcodes : []);
    return list
        .filter((b) => b && typeof b === 'object' && b.barcode)
        .map((b) => ({ ...b, barcode: String(b.barcode), stock: parseFloat(b.stock) || 0 }));
}

// Gescannten Fach-Barcode einem Fach des Artikels zuordnen (Gross-/Kleinschreibung egal)
export function findDrawer(drawers, code) {
    const wanted = String(code || '').trim().toLowerCase();
    return wanted ? drawers.find((d) => d.barcode.trim().toLowerCase() === wanted) || null : null;
}
