// Gemeinsame Regeln für Nachbestellung (Startseite, Nachbestell-Liste und Mail-Hinweis)

const num = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));

// Muss der Artikel nachbestellt werden? Nur wenn ein Mindest- oder Soll-Bestand gepflegt ist.
export function needsReorder(article) {
    const stock = num(article.istBestand) ?? 0;
    const min = num(article.mindestBestand);
    const target = num(article.sollBestand);
    if (min !== null) return stock <= min;
    if (target !== null) return stock === 0;
    return false;
}

// Vorgeschlagene Bestellmenge: auffüllen bis zum Soll-Bestand (sonst bis knapp über den Mindestbestand)
export function suggestedQuantity(article) {
    const stock = num(article.istBestand) ?? 0;
    const target = num(article.sollBestand) ?? ((num(article.mindestBestand) ?? 0) + 1);
    return Math.max(target - stock, 1);
}

// Nachbestell-Liste gruppiert nach Lieferant, inkl. Mengenvorschlag und Kosten
export function buildReorderList(articles) {
    const groups = new Map();
    for (const article of articles) {
        if (!needsReorder(article)) continue;
        const supplier = (article.supplier || '').trim() || 'Ohne Lieferant';
        const quantity = suggestedQuantity(article);
        const price = num(article.price);
        if (!groups.has(supplier)) groups.set(supplier, []);
        groups.get(supplier).push({
            id: String(article._id),
            title: article.title,
            imagePath: article.imagePath || null,
            gtin: article.gtin || '',
            orderLink: article.orderLink || '',
            stock: num(article.istBestand) ?? 0,
            min: num(article.mindestBestand),
            target: num(article.sollBestand),
            quantity,
            price,
            total: price !== null ? Math.round(price * quantity * 100) / 100 : null
        });
    }
    return [...groups.entries()]
        .map(([supplier, items]) => ({
            supplier,
            items: items.sort((a, b) => a.title.localeCompare(b.title, 'de')),
            total: Math.round(items.reduce((sum, i) => sum + (i.total || 0), 0) * 100) / 100
        }))
        .sort((a, b) => (a.supplier === 'Ohne Lieferant') - (b.supplier === 'Ohne Lieferant') || a.supplier.localeCompare(b.supplier, 'de'));
}

// Kennzahlen für die Startseite
export function inventoryStats(articles) {
    let value = 0, lowStock = 0, outOfStock = 0, notStored = 0;
    for (const a of articles) {
        const stock = num(a.istBestand) ?? 0;
        const price = num(a.price);
        if (price !== null) value += price * stock;
        if (needsReorder(a)) lowStock++;
        if (stock === 0) outOfStock++;
        const stored = (Array.isArray(a.assigned_barcodes) && a.assigned_barcodes.length > 0) || a.assigned_barcode;
        if (!stored) notStored++;
    }
    return { count: articles.length, value: Math.round(value * 100) / 100, lowStock, outOfStock, notStored };
}
