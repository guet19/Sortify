import { describe, it, expect } from 'vitest';
import { canWeigh, countFromWeight, parseCount, nextOpenIndex, stocktakeSummary, correctedStock, deviation } from '../stocktake.js';

describe('Inventur', () => {
    it('rechnet das Gewicht in Stück um', () => {
        expect(countFromWeight(184, 100, 2)).toBe(42);
        expect(countFromWeight(184.9, 100, 2)).toBe(42);   // 42.45 -> 42
        expect(countFromWeight(90, 100, 2)).toBe(0);       // leichter als die leere Kiste
        expect(countFromWeight(184, 100, 0)).toBeNull();
        expect(canWeigh({ boxWeight: 100, itemWeight: 2 })).toBe(true);
        expect(canWeigh({ boxWeight: 0, itemWeight: 2 })).toBe(true);
        expect(canWeigh({ boxWeight: null, itemWeight: 2 })).toBe(false);
        expect(canWeigh({ boxWeight: 100 })).toBe(false);
    });

    it('akzeptiert von Hand nur ganze Zahlen ab 0', () => {
        expect(parseCount('0')).toBe(0);
        expect(parseCount(' 17 ')).toBe(17);
        for (const bad of ['-1', '2.5', 'abc', '', null]) expect(parseCount(bad)).toBeNull();
    });

    const items = [
        { barcode: 'A-01', articleTitle: 'Schraube', price: 0.25, expected: 45, counted: 42 },   // -3 -> -0.75
        { barcode: 'A-02', articleTitle: 'Dübel', price: 0.05, expected: 10, counted: 10 },
        { barcode: 'A-03', articleTitle: 'Leim', price: 12.5, expected: 2, counted: 3 },         // +1 -> +12.50
        { barcode: 'A-04', articleTitle: 'Band', price: null, expected: 5, counted: 1 },         // -4, kein Preis
        { barcode: 'A-05', articleTitle: 'Bits', skipped: true },
        { barcode: 'A-06', articleTitle: 'Nägel', counted: null }
    ];

    it('findet das nächste offene Fach', () => {
        expect(nextOpenIndex(items, 0)).toBe(5);
        expect(nextOpenIndex(items.slice(0, 5), 0)).toBe(-1);
        expect(nextOpenIndex([{ counted: null }, { counted: 3, expected: 3 }, { counted: null }], 1)).toBe(2);
    });

    it('listet die Abweichungen mit Wert', () => {
        const s = stocktakeSummary(items);
        expect(s).toMatchObject({ total: 6, counted: 4, skipped: 1, open: 1, matching: 1, valueDelta: 11.75 });
        expect(s.deviations.map((d) => [d.barcode, d.diff, d.value])).toEqual([['A-03', 1, 12.5], ['A-01', -3, -0.75], ['A-04', -4, null]]);
    });

    it('übernimmt die Abweichung relativ zum heutigen Bestand', () => {
        expect(deviation(items[0])).toBe(-3);
        expect(correctedStock(items[0], 45)).toBe(42);   // nichts bewegt
        expect(correctedStock(items[0], 40)).toBe(37);   // nach dem Zählen 5 entnommen
        expect(correctedStock(items[3], 2)).toBe(0);     // nie negativ
    });
});
