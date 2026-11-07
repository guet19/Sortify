// Artikelsuche der Suchleiste (Startseite und Terminal-Suche), läuft im Browser über die geladenen Artikel.
// Mehrere Begriffe gelten als UND (Reihenfolge egal), "ODER" verbindet die Begriffe links und rechts davon:
//   12mm Schalter ODER Taster  =  12mm UND (schalter ODER taster)
// Schreibweisen werden angeglichen (12 mm = 12mm, Schlüssel = Schluessel), Tippfehler siehe resolveSearch().

export const SEARCH_SCOPES = [
    { id: 'title', label: 'Titel/GTIN', hint: 'Sucht im Artikelnamen und in der GTIN bzw. Artikelnummer' },
    { id: 'all', label: 'Alle', hint: 'Sucht auch in Lieferant, Beschreibung und Spezifikationen' }
];

const UNITS = 'mm|cm|dm|m|km|µm|um|nm|mg|g|kg|t|ml|cl|dl|l|mv|kv|v|ma|a|mah|ah|kw|w|khz|mhz|ghz|hz|kohm|ohm|bar|psi|°c|°|%|zoll|stk';
const NUMBER_WITH_UNIT = new RegExp(`(\\d) (${UNITS})(?![a-zäöüß0-9])`, 'g');

// Umlaute und Akzente: Schlüssel = Schluessel = Schlussel, Größe = Grösse = Groesse, Café = Cafe
function foldLetters(text) {
    return text
        .replace(/ß/g, 'ss')
        .replace(/ae|ä/g, 'a').replace(/oe|ö/g, 'o').replace(/ue|ü/g, 'u')
        .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Zahlen und Einheiten: "12 mm" = "12mm", "2,5" = "2.5", "5 x 60" = "5x60"
function normalizeNotation(text) {
    return String(text ?? '').normalize('NFC').toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/(\d),(?=\d)/g, '$1.')
        .replace(/(\d) ?[x×*] ?(?=\d)/g, '$1x')
        .replace(NUMBER_WITH_UNIT, '$1$2')
        .trim();
}

// Gleiche Schreibweise für Suchtext und Begriffe
export function normalizeSearchText(text) {
    return foldLetters(normalizeNotation(text));
}

const OR_WORDS = new Set(['oder', 'or', '|']);
const AND_WORDS = new Set(['und', 'and', '&', '+']);

// Eingabe -> Gruppen von Begriffen: Jede Gruppe muss zutreffen, innerhalb einer Gruppe reicht ein Begriff.
// Ein Begriff ist { term, label }: term zum Vergleichen, label wie eingegeben (zum Anzeigen).
// Leerzeichen, Komma und Semikolon trennen; "genaue Wortgruppe" bleibt zusammen
export function parseSearchQuery(input) {
    const groups = [];
    let joinLast = false;
    for (const match of normalizeNotation(input).matchAll(/"([^"]+)"|\||[^\s,;"|]+/g)) {
        const quoted = match[1] !== undefined;
        const label = (quoted ? match[1] : match[0]).trim();
        if (!label) continue;
        if (!quoted && OR_WORDS.has(label)) { joinLast = groups.length > 0; continue; }
        if (!quoted && AND_WORDS.has(label)) { joinLast = false; continue; }
        const term = foldLetters(label);
        if (joinLast) {
            if (!groups[groups.length - 1].some((t) => t.term === term)) groups[groups.length - 1].push({ term, label });
        } else if (!groups.some((g) => g.length === 1 && g[0].term === term)) {
            groups.push([{ term, label }]);
        }
        joinLast = false;
    }
    return groups;
}

// Lesbare Form, z.B. 12mm UND (schalter ODER taster)
export function describeSearch(groups) {
    const show = ({ label }) => (label.includes(' ') ? `"${label}"` : label);
    return groups
        .map((g) => (g.length > 1 && groups.length > 1 ? `(${g.map(show).join(' ODER ')})` : g.map(show).join(' ODER ')))
        .join(' UND ');
}

// Worin gesucht wird. attributes: Filter-Definitionen (Spezifikationen mit Einheit)
function searchableParts(article, attributes, scope) {
    if (scope !== 'all') return [article.title];
    const specs = attributes.flatMap((attr) => {
        const value = article.attributes?.[attr._id];
        if (value === undefined || value === null || value === '') return [];
        return [].concat(value).map((v) => `${v} ${attr.unit || ''}`);
    });
    return [article.title, article.supplier, article.description, ...specs].filter(Boolean);
}

// Suchtext und Wörter aller Artikel, einmal pro Suchbereich aufgebaut.
// code: GTIN/Artikelnummer ohne Leerzeichen – dort zählt jeder Teil der Nummer ("76100" findet "7610000000017")
export function buildSearchIndex(articles, attributes = [], scope = 'title') {
    const entries = new Map();
    const words = new Map();   // angeglichenes Wort -> Schreibweise im Artikel
    for (const article of articles) {
        const parts = searchableParts(article, attributes, scope);
        entries.set(article, {
            text: normalizeSearchText(parts.join(' | ')),
            code: normalizeSearchText(article.gtin).replace(/\s+/g, '')
        });
        for (const word of parts.join(' ').toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
            if (word.length < 3 || /\d/.test(word)) continue;
            const folded = foldLetters(word);
            if (!words.has(folded)) words.set(folded, word);
        }
    }
    return { entries, words, exact: new Map(), similar: new Map() };
}

const isDigit = (c) => c >= '0' && c <= '9';
const isLetter = (c) => c !== undefined && /[a-zµ]/.test(c);

// Enthält der Text den Begriff? Zahlen werden nicht aus grösseren Zahlen herausgelesen:
// "12" findet "M12" und "12mm", aber nicht "120", "112" oder "12.5"; "12m" findet nicht "12mm"
export function containsTerm(text, term) {
    const startsWithNumber = isDigit(term[0]);
    const endsWithNumber = isDigit(term[term.length - 1]);
    for (let i = text.indexOf(term); i !== -1; i = text.indexOf(term, i + 1)) {
        const before = text[i - 1], after = text[i + term.length];
        const insideBefore = startsWithNumber && before !== undefined && (isDigit(before) || (before === '.' && isDigit(text[i - 2] ?? '')));
        const insideAfter = endsWithNumber && after !== undefined && (isDigit(after) || (after === '.' && isDigit(text[i + term.length + 1] ?? '')));
        const longerUnit = startsWithNumber && !endsWithNumber && isLetter(after);
        if (!insideBefore && !insideAfter && !longerUnit) return true;
    }
    return false;
}

const entryHasTerm = (entry, term) => containsTerm(entry.text, term) || entry.code.includes(term);

// Kleinste Zahl Tippfehler, mit der der Begriff irgendwo im Wort steht (auch in Wortteilen:
// "schlater" in "druckschalter"). Fehlender, zusätzlicher, falscher Buchstabe und Vertauschen zählen je 1.
export function typoDistance(term, word) {
    let before = null;
    let last = new Array(word.length + 1).fill(0);
    for (let i = 1; i <= term.length; i++) {
        const row = [i];
        for (let j = 1; j <= word.length; j++) {
            row[j] = Math.min(last[j] + 1, row[j - 1] + 1, last[j - 1] + (term[i - 1] === word[j - 1] ? 0 : 1));
            if (i > 1 && j > 1 && term[i - 1] === word[j - 2] && term[i - 2] === word[j - 1]) row[j] = Math.min(row[j], before[j - 2] + 1);
        }
        before = last;
        last = row;
    }
    return Math.min(...last);
}

// Erlaubte Tippfehler: kurze Wörter und alles mit Ziffern bleibt exakt (12mm ist nicht 13mm)
function allowedTypos(term) {
    if (/[\d\s]/.test(term) || term.length < 4) return 0;
    return term.length < 8 ? 1 : 2;
}

function similarWords(term, index) {
    if (!index.similar.has(term)) {
        const limit = allowedTypos(term);
        let best = limit + 1, found = [];
        if (limit > 0) {
            for (const [folded, word] of index.words) {
                const distance = typoDistance(term, folded);
                if (distance > limit || distance > best) continue;
                if (distance < best) { best = distance; found = []; }
                found.push({ folded, word });
            }
        }
        index.similar.set(term, found.slice(0, 8));
    }
    return index.similar.get(term);
}

function hasExactHit(term, index) {
    if (!index.exact.has(term)) {
        let hit = false;
        for (const entry of index.entries.values()) {
            if (entryHasTerm(entry, term)) { hit = true; break; }
        }
        index.exact.set(term, hit);
    }
    return index.exact.get(term);
}

// Suche vorbereiten. Tippfehler: Nur wenn ein Begriff bei keinem Artikel genau vorkommt, gelten ähnlich
// geschriebene Wörter – sonst fände "Nagel" auch "Nadel".
export function resolveSearch(groups, index) {
    const fuzzy = [];
    const resolved = groups.map((group) => group.flatMap(({ term, label }) => {
        if (hasExactHit(term, index)) return [term];
        const similar = similarWords(term, index);
        if (similar.length === 0) return [term];
        fuzzy.push({ term: label, words: similar.slice(0, 3).map((s) => s.word) });
        return similar.map((s) => s.folded);
    }));
    return { index, groups, resolved, fuzzy, hasOr: groups.some((g) => g.length > 1) };
}

export function matchesSearch(search, article) {
    if (search.resolved.length === 0) return true;
    const entry = search.index.entries.get(article);
    return !!entry && search.resolved.every((group) => group.some((term) => entryHasTerm(entry, term)));
}
