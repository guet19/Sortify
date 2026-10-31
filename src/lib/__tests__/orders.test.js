import { describe, it, expect } from 'vitest';
import { parseQuantity, parseDate, todayString, remainingQuantity, deliveryState, formatDate } from '../orders.js';

describe('Bestellungen', () => {
    it('akzeptiert nur ganze Stückzahlen ab 1', () => {
        expect(parseQuantity('40')).toBe(40);
        expect(parseQuantity(' 7 ')).toBe(7);
        expect(parseQuantity(3)).toBe(3);
        for (const bad of ['0', '-2', '2.5', '1e3', 'abc', '', null, undefined, '100001']) expect(parseQuantity(bad)).toBeNull();
    });

    it('prüft den Liefertermin', () => {
        expect(parseDate('2026-11-05')).toBe('2026-11-05');
        for (const bad of ['2026-02-30', '05.11.2026', '2026-1-5', '', null, '2026-11-05T10:00']) expect(parseDate(bad)).toBeNull();
    });

    it('erkennt überfällige Lieferungen', () => {
        expect(deliveryState('2026-10-28', '2026-10-29')).toBe('overdue');
        expect(deliveryState('2026-10-29', '2026-10-29')).toBe('today');
        expect(deliveryState('2026-11-02', '2026-10-29')).toBe('open');
        expect(deliveryState(null, '2026-10-29')).toBe('none');
        expect(todayString(new Date(2026, 0, 5))).toBe('2026-01-05');
    });

    it('rechnet die offene Restmenge', () => {
        expect(remainingQuantity({ quantity: 40, received: 15 })).toBe(25);
        expect(remainingQuantity({ quantity: 40, received: 50 })).toBe(0);
        expect(remainingQuantity({ quantity: 40 })).toBe(40);
        expect(formatDate('2026-11-05')).toBe('05.11.2026');
    });
});
