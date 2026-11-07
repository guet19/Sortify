// Wird ein Barcode schon benutzt? Damit lässt sich ein Etikett prüfen, bevor es auf ein neues Fach kommt.
// Vergeben ist ein Code, wenn er in einem Regal angelernt oder einem Artikel zugewiesen ist.

export const MAX_BARCODE_LENGTH = 200;

export const cleanBarcode = (code) => String(code ?? '').trim().slice(0, MAX_BARCODE_LENGTH);

// Gross-/Kleinschreibung zählt nicht: Beim Scannen eines Fachs wäre a-01 dasselbe wie A-01 (siehe findDrawer)
const sameCode = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

// articles: die Artikel mit diesem Barcode, [{ id, title }]
export function barcodeUsage(code, shelves, articles = []) {
    const barcode = cleanBarcode(code);
    const drawers = shelves.flatMap((shelf) => (shelf.drawers || [])
        .filter((drawer) => sameCode(drawer.barcode, barcode))
        .map((drawer) => ({ barcode: drawer.barcode, shelf: shelf.name || 'Regal', ledIndex: drawer.ledIndex })));
    return { barcode, free: drawers.length === 0 && articles.length === 0, drawers, articles };
}
