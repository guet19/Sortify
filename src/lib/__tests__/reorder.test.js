import { describe, it, expect } from 'vitest';
import { needsReorder, suggestedQuantity, buildReorderList, inventoryStats } from '../reorder.js';

describe('Nachbestellung', () => {
    it('erkennt Artikel am oder unter dem Mindestbestand', () => {
        expect(needsReorder({ istBestand: 5, mindestBestand: 5 })).toBe(true);
        expect(needsReorder({ istBestand: 6, mindestBestand: 5 })).toBe(false);
        expect(needsReorder({ istBestand: 0, sollBestand: 50 })).toBe(true);
        expect(needsReorder({ istBestand: 0 })).toBe(false); // ohne Mindest-/Soll-Bestand keine Meldung
    });
    it('schlägt Menge bis zum Soll-Bestand vor', () => {
        expect(suggestedQuantity({ istBestand: 20, mindestBestand: 30, sollBestand: 100 })).toBe(80);
        expect(suggestedQuantity({ istBestand: 2, mindestBestand: 5 })).toBe(4);
        expect(suggestedQuantity({ istBestand: 200, sollBestand: 100, mindestBestand: 250 })).toBe(1);
    });
    it('gruppiert nach Lieferant und rechnet Kosten', () => {
        const list = buildReorderList([
            { _id: 1, title: 'B-Schraube', supplier: 'Würth', istBestand: 1, mindestBestand: 5, sollBestand: 11, price: 0.5 },
            { _id: 2, title: 'A-Mutter', supplier: 'Würth', istBestand: 0, mindestBestand: 2, sollBestand: 10, price: 0.2 },
            { _id: 3, title: 'Dübel', istBestand: 0, mindestBestand: 1 },
            { _id: 4, title: 'Genug', supplier: 'Würth', istBestand: 50, mindestBestand: 5 }
        ]);
        expect(list.map((g) => g.supplier)).toEqual(['Würth', 'Ohne Lieferant']);
        expect(list[0].items.map((i) => i.title)).toEqual(['A-Mutter', 'B-Schraube']);
        expect(list[0].total).toBe(7); // 10 × 0.20 + 10 × 0.50
    });
    it('berechnet Kennzahlen', () => {
        expect(inventoryStats([
            { istBestand: 10, price: 2, mindestBestand: 20, assigned_barcodes: [{ barcode: 'A' }] },
            { istBestand: 0, price: 5 }
        ])).toEqual({ count: 2, value: 20, lowStock: 1, outOfStock: 1, notStored: 1 });
    });
});
