import { describe, it, expect } from 'vitest';
import { normalizeArticleBarcodes } from '../barcodes.js';

describe('normalizeArticleBarcodes', () => {
    it('lässt aktuelle Artikel unverändert', () => {
        expect(normalizeArticleBarcodes({ assigned_barcodes: [{ barcode: 'A-01', stock: 3 }], istBestand: 3 })).toBeNull();
        expect(normalizeArticleBarcodes({ assigned_barcodes: [], istBestand: 0 })).toBeNull();
    });

    it('wandelt das alte Einzelfach um und behält den Bestand', () => {
        expect(normalizeArticleBarcodes({ assigned_barcode: ' A-01 ', istBestand: 12 })).toEqual([{ barcode: 'A-01', stock: 12 }]);
    });

    it('wandelt String-Listen um und entfernt Duplikate', () => {
        const result = normalizeArticleBarcodes({ assigned_barcodes: ['A-01', 'A-02', 'A-01'], istBestand: 5 });
        expect(result).toEqual([{ barcode: 'A-01', stock: 5 }, { barcode: 'A-02', stock: 0 }]);
    });

    it('mischt altes Hauptfach mit vorhandenen Objekten ohne Bestand zu verändern', () => {
        const result = normalizeArticleBarcodes({ assigned_barcode: 'B-01', assigned_barcodes: [{ barcode: 'B-02', stock: 4, boxWeight: 10 }], istBestand: 4 });
        expect(result).toEqual([{ barcode: 'B-01', stock: 0 }, { barcode: 'B-02', stock: 4, boxWeight: 10 }]);
    });

    it('entfernt leere Altfelder', () => {
        expect(normalizeArticleBarcodes({ assigned_barcode: null, istBestand: 0 })).toEqual([]);
    });
});

import { articleDrawers, findDrawer } from '../barcodes.js';
describe('articleDrawers', () => {
    it('liefert die Fächer im aktuellen Format', () => {
        expect(articleDrawers({ assigned_barcodes: [{ barcode: 'A-05', stock: 10, boxWeight: 100 }, { barcode: 'B-02', stock: '4' }] }))
            .toEqual([{ barcode: 'A-05', stock: 10, boxWeight: 100 }, { barcode: 'B-02', stock: 4 }]);
    });
    it('wandelt Altdaten um und kennt Artikel ohne Fach', () => {
        expect(articleDrawers({ assigned_barcode: 'A-01', istBestand: 7 })).toEqual([{ barcode: 'A-01', stock: 7 }]);
        expect(articleDrawers({ istBestand: 3 })).toEqual([]);
    });
    it('findet gescannte Fächer unabhängig von Gross-/Kleinschreibung', () => {
        const drawers = articleDrawers({ assigned_barcodes: [{ barcode: 'A-05', stock: 1 }] });
        expect(findDrawer(drawers, ' a-05 ')?.barcode).toBe('A-05');
        expect(findDrawer(drawers, 'B-99')).toBeNull();
    });
});
