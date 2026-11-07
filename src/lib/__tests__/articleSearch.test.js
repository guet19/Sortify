import { describe, it, expect } from 'vitest';
import { normalizeSearchText, parseSearchQuery, describeSearch, buildSearchIndex, resolveSearch, matchesSearch, containsTerm, typoDistance } from '../articleSearch.js';

const attributes = [{ _id: 'd', label: 'Durchmesser', unit: 'mm' }, { _id: 'f', label: 'Farbe' }];
const articles = [
    { title: 'Drucktaster Schalter 12 mm rot', gtin: '7610000000017', supplier: 'Würth' },
    { title: 'Kippschalter 16mm grün', gtin: 'ABC-123' },
    { title: 'Druckknopf 12mm' },
    { title: 'Schalter Metall', attributes: { d: '12', f: ['Grün', 'Rot'], itemWeight: 3 } },
    { title: 'Schalter 112mm blau' },
    { title: 'Lampe gelb', description: 'Passt in einen 12mm Schalter-Ausschnitt.' },
    { title: 'Schlüsselanhänger Größe M' },
    { title: 'Nagel 40mm' },
    { title: 'Nadel fein' }
];
const terms = (query) => parseSearchQuery(query).map((group) => group.map((t) => t.term));
const search = (query, scope = 'title') => {
    const prepared = resolveSearch(parseSearchQuery(query), buildSearchIndex(articles, attributes, scope));
    return { titles: articles.filter((a) => matchesSearch(prepared, a)).map((a) => a.title), prepared };
};

describe('Artikelsuche', () => {
    it('gleicht Schreibweisen an', () => {
        expect(normalizeSearchText('Schalter  12 MM')).toBe('schalter 12mm');
        expect(normalizeSearchText('Kabel 2,5 mm')).toBe('kabel 2.5mm');
        expect(normalizeSearchText('Schraube 5 x 60 mm')).toBe('schraube 5x60mm');
        expect(normalizeSearchText('Holz 5×60')).toBe('holz 5x60');
        expect(normalizeSearchText('M12 Schraube')).toBe('m12 schraube');
    });

    it('gleicht Umlaute und Akzente an', () => {
        for (const word of ['Schlüssel', 'Schluessel', 'Schlussel', 'SCHLÜSSEL']) expect(normalizeSearchText(word)).toBe('schlussel');
        for (const word of ['Größe', 'Grösse', 'Groesse', 'Grosse']) expect(normalizeSearchText(word)).toBe('grosse');
        expect(normalizeSearchText('Café')).toBe('cafe');
        expect(normalizeSearchText('Schlüssel')).toBe('schlussel');   // ü aus zwei Zeichen (z.B. vom Mac kopiert)
    });

    it('zerlegt die Eingabe in UND-Gruppen mit ODER', () => {
        expect(terms('12mm Schalter')).toEqual([['12mm'], ['schalter']]);
        expect(terms('12 mm, Schalter; rot')).toEqual([['12mm'], ['schalter'], ['rot']]);
        expect(terms('12mm Schalter ODER Taster')).toEqual([['12mm'], ['schalter', 'taster']]);
        expect(terms('rot oder grün or blau | gelb')).toEqual([['rot', 'grun', 'blau', 'gelb']]);
        expect(terms('12mm UND Schalter')).toEqual([['12mm'], ['schalter']]);
        expect(terms('"rote Lampe" 2,5')).toEqual([['rote lampe'], ['2.5']]);
        expect(terms('"oder"')).toEqual([['oder']]);
        expect(terms('rot rot grün gruen')).toEqual([['rot'], ['grun']]);
    });

    it('verkraftet halb getippte Operatoren', () => {
        expect(terms('rot ODER')).toEqual([['rot']]);
        expect(terms('ODER rot')).toEqual([['rot']]);
        expect(terms('ODER')).toEqual([]);
        expect(terms('   ')).toEqual([]);
    });

    it('beschreibt die Suche lesbar', () => {
        expect(describeSearch(parseSearchQuery('12mm Schalter ODER Taster'))).toBe('12mm UND (schalter ODER taster)');
        expect(describeSearch(parseSearchQuery('rot ODER grün'))).toBe('rot ODER grün');   // wie eingegeben
        expect(describeSearch(parseSearchQuery('"rote lampe" ODER led'))).toBe('"rote lampe" ODER led');
    });

    it('UND: alle Begriffe, Reihenfolge egal', () => {
        expect(search('12mm Schalter').titles).toEqual(['Drucktaster Schalter 12 mm rot']);
        expect(search('Schalter 12 mm').titles).toEqual(['Drucktaster Schalter 12 mm rot']);
    });

    it('ODER, auch kombiniert mit UND', () => {
        expect(search('blau ODER rot').titles).toEqual(['Drucktaster Schalter 12 mm rot', 'Schalter 112mm blau']);
        expect(search('12mm Schalter ODER Druckknopf').titles).toEqual(['Drucktaster Schalter 12 mm rot', 'Druckknopf 12mm']);
    });

    it('Suchbereich: Titel/GTIN oder Alle', () => {
        expect(search('12mm Schalter', 'all').titles).toEqual(['Drucktaster Schalter 12 mm rot', 'Schalter Metall', 'Lampe gelb']);
        expect(search('Würth').titles).toEqual([]);
        expect(search('wuerth', 'all').titles).toEqual(['Drucktaster Schalter 12 mm rot']);
        expect(search('Durchmesser', 'all').titles).toEqual([]);   // Bezeichnung des Filters zählt nicht
    });

    it('findet Teile der GTIN bzw. Artikelnummer', () => {
        expect(search('76100').titles).toEqual(['Drucktaster Schalter 12 mm rot']);
        expect(search('7610 0000').titles).toEqual(['Drucktaster Schalter 12 mm rot']);
        expect(search('abc-1').titles).toEqual(['Kippschalter 16mm grün']);
    });

    it('liest Zahlen nicht aus grösseren Zahlen heraus', () => {
        expect(containsTerm('schalter 112mm', '12mm')).toBe(false);
        expect(containsTerm('rolle 120 stuck', '12')).toBe(false);
        expect(containsTerm('stab 12.5mm', '12')).toBe(false);
        expect(containsTerm('kabel 12.5mm', '2.5mm')).toBe(false);
        expect(containsTerm('band 12mm', '12m')).toBe(false);
        expect(containsTerm('schraube m120', 'm12')).toBe(false);
        expect(containsTerm('schraube m12', '12')).toBe(true);
        expect(containsTerm('gewinde 2x12mm', '12mm')).toBe(true);
        expect(containsTerm('gewindestange 112 / 12mm', '12mm')).toBe(true);   // zweite Stelle passt
        expect(containsTerm('druckschalter', 'schalter')).toBe(true);
    });

    it('zählt Tippfehler, auch in Wortteilen', () => {
        expect(typoDistance('schalter', 'druckschalter')).toBe(0);
        expect(typoDistance('schlater', 'druckschalter')).toBe(1);   // vertauscht
        expect(typoDistance('schaltr', 'schalter')).toBe(1);         // Buchstabe fehlt
        expect(typoDistance('schalterr', 'schalter')).toBe(1);       // Buchstabe zu viel
        expect(typoDistance('schaltar', 'schalter')).toBe(1);        // falscher Buchstabe
    });

    it('toleriert Tippfehler und nennt die ähnlichen Wörter', () => {
        const { titles, prepared } = search('Schlater');
        expect(titles).toEqual(['Drucktaster Schalter 12 mm rot', 'Kippschalter 16mm grün', 'Schalter Metall', 'Schalter 112mm blau']);
        expect(prepared.fuzzy).toHaveLength(1);
        expect(prepared.fuzzy[0].term).toBe('schlater');
        expect(search('Schlüselanhänger').prepared.fuzzy[0].term).toBe('schlüselanhänger');   // wie eingegeben
        expect(prepared.fuzzy[0].words).toContain('schalter');
        expect(search('Drucktastr 12mm').titles).toEqual(['Drucktaster Schalter 12 mm rot']);
        expect(search('Schlüselanhänger').titles).toEqual(['Schlüsselanhänger Größe M']);
    });

    it('nutzt Umlaut-Schreibweisen ohne Tippfehler-Hinweis', () => {
        for (const query of ['Schluesselanhaenger', 'schlusselanhanger', 'Groesse', 'Grosse']) {
            const { titles, prepared } = search(query);
            expect(titles).toEqual(['Schlüsselanhänger Größe M']);
            expect(prepared.fuzzy).toEqual([]);
        }
    });

    it('zeigt keine ähnlichen Wörter, wenn es genaue Treffer gibt', () => {
        const { titles, prepared } = search('Nagel');
        expect(titles).toEqual(['Nagel 40mm']);
        expect(prepared.fuzzy).toEqual([]);
    });

    it('lässt Zahlen und kurze Wörter exakt', () => {
        expect(search('13mm').titles).toEqual([]);
        expect(search('Rit').titles).toEqual([]);          // kurz: kein "rot"
        expect(search('12mm Schlater').titles).toEqual(['Drucktaster Schalter 12 mm rot']);
        expect(search('Xylophon').titles).toEqual([]);
    });

    it('leere Suche zeigt alle Artikel', () => {
        expect(search('').titles).toHaveLength(articles.length);
        expect(search('ODER').titles).toHaveLength(articles.length);
    });
});
