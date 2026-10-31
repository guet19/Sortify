import { describe, it, expect } from 'vitest';
import { shelfTerminalId, ledTargets, scaleTerminalId, nextFreeLed, nextTerminalName, cleanTerminalName } from '../terminals.js';

const north = { id: 'n1' }, south = { id: 's2' };
const terminals = [north, south];
const shelves = [
    { name: 'Alt (ohne Zuordnung)', start_index: 0, drawer_count: 2, drawers: [{ barcode: 'A-01', ledIndex: 0 }, { barcode: 'A-02', ledIndex: 1 }] },
    { name: 'Nord', deviceId: 'n1', start_index: 2, drawer_count: 1, drawers: [{ barcode: 'N-01', ledIndex: 2 }] },
    { name: 'Süd', deviceId: 's2', start_index: 0, drawer_count: 3, drawers: [{ barcode: 'S-01', ledIndex: 0 }, { barcode: 'S-02', ledIndex: 1 }, { barcode: '', ledIndex: 2 }] },
    { name: 'Verwaist', deviceId: 'entfernt', start_index: 5, drawer_count: 1, drawers: [{ barcode: 'X-01', ledIndex: 5 }] }
];

describe('Mehrere Terminals', () => {
    it('Regal ohne (gültige) Zuordnung gehört zum zuerst gekoppelten Terminal', () => {
        expect(shelfTerminalId(shelves[0], terminals)).toBe('n1');
        expect(shelfTerminalId(shelves[2], terminals)).toBe('s2');
        expect(shelfTerminalId(shelves[3], terminals)).toBe('n1');
        expect(shelfTerminalId(shelves[2], [])).toBeNull();
    });

    it('LED-Befehle gehen nur an das Terminal des jeweiligen Regals', () => {
        const groups = ledTargets(shelves, ['A-02', 'S-01', 'S-02', 'N-01'], terminals);
        expect(groups).toEqual([{ terminalId: 'n1', leds: [2, 3] }, { terminalId: 's2', leds: [1, 2] }]);
        expect(ledTargets(shelves, ['unbekannt'], terminals)).toEqual([]);
        // ohne gekoppelte Terminals: eine Gruppe wie bisher
        expect(ledTargets(shelves, ['A-01', 'S-01'], [])).toEqual([{ terminalId: null, leds: [1, 1] }]);
    });

    it('Waage: gewähltes Terminal, sonst das einzige, sonst das des Regals', () => {
        expect(scaleTerminalId(terminals, { selectedId: 's2' })).toBe('s2');
        expect(scaleTerminalId(terminals, { selectedId: 'fremd' })).toBeNull();
        expect(scaleTerminalId([north], {})).toBe('n1');
        expect(scaleTerminalId([], {})).toBeNull();
        expect(scaleTerminalId(terminals, { shelf: shelves[2] })).toBe('s2');
        expect(scaleTerminalId(terminals, { selectedId: 'n1', shelf: shelves[2] })).toBe('n1');
    });

    it('nächste freie LED pro Terminal-Streifen', () => {
        expect(nextFreeLed(shelves, 'n1', terminals)).toBe(6);   // Alt (0–1), Nord (2), Verwaist (5)
        expect(nextFreeLed(shelves, 's2', terminals)).toBe(3);
        expect(nextFreeLed([], 's2', terminals)).toBe(0);
        // Fächeranzahl fehlt: die LED-Nummern der Fächer zählen
        expect(nextFreeLed([{ start_index: 0, drawers: [{ barcode: 'A', ledIndex: 4 }, { barcode: 'B', ledIndex: 7 }] }], 'n1', terminals)).toBe(8);
    });

    it('Namen für neue Terminals', () => {
        expect(nextTerminalName([])).toBe('Terminal 1');
        expect(nextTerminalName(['Terminal 1', 'Regalwand Nord'])).toBe('Terminal 2');
        expect(nextTerminalName(['terminal 2'])).toBe('Terminal 1');
        expect(cleanTerminalName('  Regal   Nord ')).toBe('Regal Nord');
        expect(cleanTerminalName('x'.repeat(60))).toHaveLength(40);
    });
});
