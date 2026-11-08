import { describe, it, expect } from 'vitest';
import { numberLabels, duplicateCount, labelKey } from '../labelBuffer.js';

const entry = (id, code) => ({ id, code });

describe('Zwischenspeicher der Etiketten', () => {
    it('nummeriert in Scan-Reihenfolge, das neueste steht oben', () => {
        const labels = numberLabels([entry('c', 'C'), entry('b', 'B'), entry('a', 'A')]);
        expect(labels.map((l) => [l.code, l.number])).toEqual([['C', 3], ['B', 2], ['A', 1]]);
        expect(duplicateCount(labels)).toBe(0);
    });

    it('markiert doppelte Codes gegenseitig', () => {
        const labels = numberLabels([entry('4', 'A-01'), entry('3', 'B'), entry('2', 'A-01'), entry('1', 'A-01')]);
        expect(labels.map((l) => l.sameAs)).toEqual([[1, 2], [], [1, 4], [2, 4]]);
        expect(duplicateCount(labels)).toBe(3);
    });

    it('Gross-/Kleinschreibung und Leerzeichen zählen nicht', () => {
        const labels = numberLabels([entry('2', ' a-01'), entry('1', 'A-01 ')]);
        expect(labels[0].sameAs).toEqual([1]);
        expect(labelKey(' A-01 ')).toBe('a-01');
    });

    it('leerer Zwischenspeicher', () => {
        expect(numberLabels([])).toEqual([]);
        expect(duplicateCount([])).toBe(0);
    });
});
