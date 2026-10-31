// Bestellungen (Nachbestellen): gemeinsame Regeln für Server und Browser.
// Eine offene Bestellung zählt als Bestand, der unterwegs ist (siehe $lib/reorder.js).

export const MAX_ORDER_QUANTITY = 100000;

// Bestell- bzw. Liefermenge: ganze Stückzahl ≥ 1, sonst null
export function parseQuantity(value) {
    const text = String(value ?? '').trim();
    if (!/^\d+$/.test(text)) return null;
    const n = Number(text);
    return n >= 1 && n <= MAX_ORDER_QUANTITY ? n : null;
}

// Liefertermin als 'YYYY-MM-DD' (Datum ohne Uhrzeit, damit sich der Tag nicht durch Zeitzonen verschiebt)
export function parseDate(value) {
    const text = String(value ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const d = new Date(`${text}T00:00:00Z`);
    return !isNaN(d) && d.toISOString().slice(0, 10) === text ? text : null;
}

// Heutiges Datum im selben Format, in der Zeitzone des Geräts
export function todayString(now = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Noch nicht gelieferte Menge
export function remainingQuantity(order) {
    return Math.max((Number(order.quantity) || 0) - (Number(order.received) || 0), 0);
}

// 'overdue' (Termin vorbei), 'today', 'open' (Termin in der Zukunft) oder 'none' (kein Termin)
export function deliveryState(expectedDate, today = todayString()) {
    if (!expectedDate) return 'none';
    if (expectedDate < today) return 'overdue';
    return expectedDate === today ? 'today' : 'open';
}

export function formatDate(isoDate) {
    if (!isoDate) return '';
    const [y, m, d] = String(isoDate).slice(0, 10).split('-');
    return `${d}.${m}.${y}`;
}
