// CSV lesen und schreiben (Excel CH/DE nutzt Semikolon, international Komma)

// Liest CSV-Text in ein Array von Zeilen (Arrays). Erkennt das Trennzeichen automatisch.
export function parseCsv(text) {
    const src = String(text || '').replace(/^﻿/, '');
    const firstLine = src.split(/\r?\n/, 1)[0] || '';
    const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';

    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (inQuotes) {
            if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') inQuotes = false;
            else field += c;
        } else if (c === '"') inQuotes = true;
        else if (c === delimiter) { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && src[i + 1] === '\n') i++;
            row.push(field); rows.push(row); row = []; field = '';
        } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

// Liest CSV mit Kopfzeile in Objekte; Spaltennamen ohne Gross-/Kleinschreibung und Leerzeichen
export function parseCsvObjects(text) {
    const [header = [], ...rows] = parseCsv(text);
    const keys = header.map((h) => normalizeHeader(h));
    return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

export function normalizeHeader(h) {
    return String(h).trim().toLowerCase().replace(/[\s_\-./()]+/g, '');
}

// Schreibt Zeilen als CSV mit Semikolon und BOM (Excel erkennt so Umlaute)
export function toCsv(rows) {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
}

// Zahl aus "12,50" oder "12.50"; leer -> null
export function parseNumber(value) {
    const v = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.');
    if (v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
}
