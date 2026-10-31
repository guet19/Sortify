// Inventur: Ein Regal wird Fach für Fach gezählt (gewogen oder von Hand), am Ende gibt es die Abweichungen.
// Gemeinsame Regeln für Server und Browser. Ein Fach (item) enthält u.a.:
//   { barcode, articleTitle, price, boxWeight, itemWeight, counted, expected, skipped }
// expected = Bestand laut Sortify im Moment des Zählens, counted = gezählte Menge

export const MAX_COUNT = 1000000;

// Lässt sich das Fach wiegen? (Leergewicht der Kiste und Stückgewicht bekannt)
export function canWeigh(item) {
    return Number.isFinite(Number(item?.boxWeight)) && item?.boxWeight !== null && Number(item?.itemWeight) > 0;
}

// Stückzahl aus dem Gewicht – wie bei der Rückgabe am Terminal
export function countFromWeight(weight, boxWeight, itemWeight) {
    const w = Number(weight), box = Number(boxWeight) || 0, per = Number(itemWeight);
    if (!Number.isFinite(w) || !(per > 0)) return null;
    return Math.round(Math.max(0, w - box) / per);
}

// Von Hand gezählte Menge: ganze Zahl ≥ 0, sonst null
export function parseCount(value) {
    const text = String(value ?? '').trim();
    if (!/^\d+$/.test(text)) return null;
    const n = Number(text);
    return n <= MAX_COUNT ? n : null;
}

export const isCounted = (item) => item.counted !== null && item.counted !== undefined && !item.skipped;
export const deviation = (item) => (isCounted(item) ? item.counted - (Number(item.expected) || 0) : 0);

// Erstes noch offenes Fach ab Position "from" (danach von vorne), sonst -1
export function nextOpenIndex(items, from = 0) {
    for (let k = 0; k < items.length; k++) {
        const i = (from + k) % items.length;
        if (!isCounted(items[i]) && !items[i].skipped) return i;
    }
    return -1;
}

// Auswertung: Abweichungen (grösste Wertdifferenz zuerst) und Kennzahlen
export function stocktakeSummary(items) {
    const counted = items.filter(isCounted);
    const deviations = counted
        .filter((i) => deviation(i) !== 0)
        .map((i) => {
            const diff = deviation(i);
            const price = Number(i.price) > 0 ? Number(i.price) : null;
            return { ...i, diff, value: price !== null ? Math.round(diff * price * 100) / 100 : null };
        })
        .sort((a, b) => Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0) || Math.abs(b.diff) - Math.abs(a.diff));
    const valueDelta = Math.round(deviations.reduce((sum, d) => sum + (d.value || 0), 0) * 100) / 100;
    return {
        total: items.length,
        counted: counted.length,
        skipped: items.filter((i) => i.skipped).length,
        open: items.filter((i) => !isCounted(i) && !i.skipped).length,
        matching: counted.length - deviations.length,
        deviations,
        valueDelta
    };
}

// Neuer Fachbestand beim Übernehmen: gezählt + was sich seit dem Zählen bewegt hat
// (z.B. eine Entnahme nach dem Zählen bleibt erhalten)
export function correctedStock(item, currentStock) {
    return Math.max(0, (Number(currentStock) || 0) + deviation(item));
}
