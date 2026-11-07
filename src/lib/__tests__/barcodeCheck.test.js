import { describe, it, expect } from 'vitest';
import { barcodeUsage, cleanBarcode, MAX_BARCODE_LENGTH } from '../barcodeCheck.js';

const shelves = [
    { name: 'Wand Nord', drawers: [{ barcode: 'A-01', ledIndex: 0 }, { barcode: 'A-02', ledIndex: 1 }] },
    { name: 'Wand Süd', drawers: [{ barcode: 'A-02', ledIndex: 7 }, { barcode: '', ledIndex: 8 }] },
    { drawers: [{ barcode: 'B-01', ledIndex: 9 }] },
    { name: 'Ohne Fächer' }
];
const screw = { id: 'a1', title: 'Schraube M3' };

describe('Barcode prüfen', () => {
    it('unbekannter Code ist frei', () => {
        expect(barcodeUsage('Z-99', shelves)).toEqual({ barcode: 'Z-99', free: true, drawers: [], articles: [] });
    });

    it('Code im Regal ist vergeben, auch ohne Artikel', () => {
        const usage = barcodeUsage('A-01', shelves);
        expect(usage.free).toBe(false);
        expect(usage.drawers).toEqual([{ barcode: 'A-01', shelf: 'Wand Nord', ledIndex: 0 }]);
    });

    it('Code bei einem Artikel ist vergeben, auch ohne Regal', () => {
        const usage = barcodeUsage('Z-99', shelves, [screw]);
        expect(usage.free).toBe(false);
        expect(usage.drawers).toEqual([]);
        expect(usage.articles).toEqual([screw]);
    });

    it('findet doppelt angelernte Codes in allen Regalen', () => {
        expect(barcodeUsage('A-02', shelves).drawers.map((d) => d.shelf)).toEqual(['Wand Nord', 'Wand Süd']);
    });

    it('Gross-/Kleinschreibung und Leerzeichen zählen nicht', () => {
        const usage = barcodeUsage('  a-01 ', shelves);
        expect(usage.barcode).toBe('a-01');
        expect(usage.free).toBe(false);
        expect(usage.drawers[0].barcode).toBe('A-01');   // gespeicherte Schreibweise, damit die LED gefunden wird
    });

    it('Fach ohne Barcode trifft keine leere Eingabe', () => {
        expect(barcodeUsage('', [{ name: 'X', drawers: [{ barcode: 'A', ledIndex: 0 }] }]).drawers).toEqual([]);
    });

    it('Regal ohne Namen bekommt eine Bezeichnung', () => {
        expect(barcodeUsage('B-01', shelves).drawers[0].shelf).toBe('Regal');
    });

    it('begrenzt die Länge', () => {
        expect(cleanBarcode('x'.repeat(500))).toHaveLength(MAX_BARCODE_LENGTH);
        expect(cleanBarcode(null)).toBe('');
    });
});
