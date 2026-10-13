import { describe, it, expect } from 'vitest';
import { parseCsv, parseCsvObjects, toCsv, parseNumber } from '../csv.js';

describe('CSV', () => {
    it('erkennt Semikolon, Anführungszeichen und Zeilenumbrüche', () => {
        expect(parseCsv('﻿a;b;c\r\n"x;1";"Er sagte ""Hallo""";"zwei\nZeilen"\r\n')).toEqual([
            ['a', 'b', 'c'],
            ['x;1', 'Er sagte "Hallo"', 'zwei\nZeilen']
        ]);
    });
    it('erkennt Komma als Trennzeichen und überspringt leere Zeilen', () => {
        expect(parseCsv('a,b\n1,2\n\n3,4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
    });
    it('liest Kopfzeilen unabhängig von Schreibweise', () => {
        expect(parseCsvObjects('Titel;Ist-Bestand;GTIN / EAN\nSchraube;5;761')).toEqual([{ titel: 'Schraube', istbestand: '5', gtinean: '761' }]);
    });
    it('schreibt und liest verlustfrei', () => {
        const rows = [['Titel', 'Preis'], ['Müller "Spezial"; groß', '1,50']];
        expect(parseCsv(toCsv(rows))).toEqual(rows);
    });
    it('liest Zahlen mit Komma oder Punkt', () => {
        expect(parseNumber('12,50')).toBe(12.5);
        expect(parseNumber('3')).toBe(3);
        expect(parseNumber('')).toBeNull();
        expect(parseNumber('abc')).toBeNaN();
    });
});

import { validateImportRows, articlesToRows } from '../articleCsv.js';
import { parseCsvObjects as parseObj } from '../csv.js';

describe('Artikel-Import', () => {
    const categories = [{ _id: 'c1', name: 'Schrauben', subcategories: [{ id: 's1', name: 'Holzschrauben' }] }];
    const csv = 'Titel;Hauptkategorie;Unterkategorie;Ist-Bestand;Preis;GTIN;Bestelllink\n'
        + 'Spax 4x40;schrauben;HOLZSCHRAUBEN;120;0,12;761;https://shop/a\n'
        + ';Schrauben;Holzschrauben;-1;x;;javascript:x\n'
        + 'Dübel;Dübel;Nylon;5;;;\n'
        + 'Doppelt;Schrauben;Holzschrauben;1;;761;';

    it('prüft Zeilen und ordnet Kategorien ohne Gross-/Kleinschreibung zu', () => {
        const [ok, bad, unknown, dup] = validateImportRows(parseObj(csv), categories);
        expect(ok.errors).toEqual([]);
        expect(ok.data).toMatchObject({ mainCategoryId: 'c1', subcategoryId: 's1', istBestand: 120, price: 0.12 });
        expect(bad.errors).toEqual(expect.arrayContaining(['Titel fehlt', 'Ist-Bestand ungültig', 'Preis ungültig', 'Bestelllink muss mit http(s) beginnen']));
        expect(unknown.errors[0]).toMatch(/existiert nicht/);
        expect(dup.skipped).toBe('GTIN existiert bereits');
    });
    it('legt unbekannte Kategorien an, wenn erlaubt', () => {
        const rows = validateImportRows(parseObj(csv), categories, { allowNewCategories: true });
        expect(rows[2].errors).toEqual([]);
        expect(rows[2].newCategory).toEqual({ main: true, sub: true });
    });
    it('überspringt GTINs, die es schon gibt', () => {
        expect(validateImportRows(parseObj(csv), categories, { existingGtins: ['761'] })[0].skipped).toBeTruthy();
    });
    it('exportiert mit Kategorienamen und Fächern', () => {
        const [header, row] = articlesToRows([{ title: 'Spax', mainCategoryId: 'c1', subcategoryId: 's1', istBestand: 5, price: 0.5, assigned_barcodes: [{ barcode: 'A-01' }] }], categories);
        expect(header[0]).toBe('Titel');
        expect(row).toEqual(['Spax', 'Schrauben', 'Holzschrauben', '5', '', '', '', '', '0,5', '', '', 'A-01']);
    });
});
