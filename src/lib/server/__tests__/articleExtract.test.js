import { describe, it, expect } from 'vitest';
import { extractPrompt, cleanHint, EXTRACT_INSTRUCTION, MAX_HINT_CHARS } from '../articleExtract.js';

describe('KI-Artikelimport: Hinweis des Nutzers', () => {
    it('steht mit Vorrang in der Anfrage', () => {
        const prompt = extractPrompt({ html: 'SEITENTEXT: M3 x 6 mm / M3 x 10 mm / M4 x 10 mm', hint: '  M3 x 10 mm,\n 100 Stück ' });
        expect(prompt).toContain('HINWEIS DES NUTZERS (hat Vorrang');
        expect(prompt).toContain('M3 x 10 mm, 100 Stück');
        expect(prompt.indexOf('HINWEIS DES NUTZERS')).toBeLessThan(prompt.indexOf('Extrahierte Shop-Daten'));
        expect(EXTRACT_INSTRUCTION).toMatch(/VARIANTEN:.*HINWEIS DES NUTZERS/);
    });
    it('fehlt ohne Hinweis ganz', () => {
        expect(extractPrompt({ html: 'x', hint: '   ' })).not.toContain('HINWEIS DES NUTZERS');
        expect(extractPrompt({ html: 'x' })).not.toContain('HINWEIS DES NUTZERS');
    });
    it('wird begrenzt', () => {
        expect(cleanHint('a'.repeat(1000))).toHaveLength(MAX_HINT_CHARS);
        expect(cleanHint(null)).toBe('');
    });
});
