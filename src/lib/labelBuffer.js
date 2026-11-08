// Zwischenspeicher der Etikettenprüfung (Service-Seite): Jedes geprüfte Etikett wird pro Lager gemerkt
// und jedes weitere damit abgeglichen. So fallen doppelt gedruckte Etiketten auf – auch solange noch
// keines aufgeklebt und angelernt ist und die Prüfung gegen Regale und Artikel deshalb „frei“ meldet.

export const MAX_LABELS = 500;

// Gleicher Code ohne Rücksicht auf Gross-/Kleinschreibung (wie beim Scannen eines Fachs)
export const labelKey = (code) => String(code ?? '').trim().toLowerCase();

// entries: neueste zuerst. Ergänzt die Nummer in Scan-Reihenfolge (1 = zuerst geprüft) und
// sameAs: die Nummern der anderen Etiketten mit demselben Code (leer = nicht doppelt)
export function numberLabels(entries) {
    const numbered = entries.map((entry, i) => ({ ...entry, number: entries.length - i }));
    const byCode = new Map();
    for (const label of numbered) {
        const key = labelKey(label.code);
        byCode.set(key, [...(byCode.get(key) || []), label.number]);
    }
    return numbered.map((label) => ({
        ...label,
        sameAs: byCode.get(labelKey(label.code)).filter((n) => n !== label.number).sort((a, b) => a - b)
    }));
}

export const duplicateCount = (labels) => labels.filter((label) => label.sameAs.length > 0).length;
