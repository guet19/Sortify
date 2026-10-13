import { describe, it, expect } from 'vitest';
import {
    escapeRegex, safeRedirect, safeHttpUrl, isHexColor, passwordError,
    generateNumericCode, generateToken, hashToken, assertPublicUrl
} from '../security.js';

describe('escapeRegex', () => {
    it('macht Sonderzeichen unschädlich', () => {
        const re = new RegExp(`^${escapeRegex('.*')}$`, 'i');
        expect(re.test('admin@sortify.ch')).toBe(false);
        expect(re.test('.*')).toBe(true);
    });
});

describe('safeRedirect', () => {
    it.each([
        ['/terminal?x=1', '/terminal?x=1'],
        ['//evil.com', '/'],
        ['/\\evil.com', '/'],
        ['https://evil.com', '/'],
        [null, '/']
    ])('%s -> %s', (input, expected) => {
        expect(safeRedirect(input)).toBe(expected);
    });
});

describe('safeHttpUrl', () => {
    it('erlaubt nur http(s)', () => {
        expect(safeHttpUrl('https://shop.example/a')).toBe('https://shop.example/a');
        expect(safeHttpUrl('javascript:alert(1)')).toBe('');
        expect(safeHttpUrl('kein link')).toBe('');
        expect(safeHttpUrl('')).toBe('');
    });
});

describe('Eingaben & Passwörter', () => {
    it('prüft Farben', () => {
        expect(isHexColor('#3b82f6')).toBe(true);
        expect(isHexColor('red')).toBe(false);
    });
    it('verlangt 10 bis 72 Zeichen', () => {
        expect(passwordError('kurz')).toMatch(/mindestens/);
        expect(passwordError('a'.repeat(73))).toMatch(/maximal/);
        expect(passwordError('ausreichend-lang')).toBeNull();
    });
});

describe('Tokens & Codes', () => {
    it('erzeugt 6-stellige Codes', () => {
        for (let i = 0; i < 50; i++) expect(generateNumericCode()).toMatch(/^\d{6}$/);
    });
    it('erzeugt eindeutige Tokens und stabile Hashes', () => {
        const a = generateToken(), b = generateToken();
        expect(a).not.toBe(b);
        expect(a).toHaveLength(64);
        expect(hashToken(a)).toBe(hashToken(a));
        expect(hashToken(a)).not.toBe(a);
    });
});

describe('assertPublicUrl (SSRF-Schutz)', () => {
    it.each(['http://127.0.0.1/', 'http://169.254.169.254/latest', 'http://[::1]/', 'http://10.0.0.5/', 'file:///etc/passwd'])(
        'blockiert %s', async (url) => {
            await expect(assertPublicUrl(url)).rejects.toThrow();
        }
    );
    it('erlaubt öffentliche IP-Adressen', async () => {
        await expect(assertPublicUrl('https://8.8.8.8/')).resolves.toBeTruthy();
    });
});
