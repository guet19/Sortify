import { describe, it, expect } from 'vitest';
import { canAccessPath } from '../permissions.js';

describe('canAccessPath', () => {
    it('Vollzugriff mit *', () => {
        expect(canAccessPath('/einstellungen/team', ['*'])).toBe(true);
    });
    it('prüft nur an Segmentgrenzen', () => {
        expect(canAccessPath('/terminal/return', ['/terminal'])).toBe(true);
        expect(canAccessPath('/terminalxyz', ['/terminal'])).toBe(false);
    });
    it('"/" gilt nur für die Startseite', () => {
        expect(canAccessPath('/', ['/'])).toBe(true);
        expect(canAccessPath('/einstellungen/team', ['/'])).toBe(false);
    });
    it('Terminal-Einstellungen müssen einzeln freigegeben werden', () => {
        expect(canAccessPath('/terminal/settings/pairing', ['/terminal'])).toBe(false);
        expect(canAccessPath('/terminal/settings/assign/123', ['/terminal/settings/assign'])).toBe(true);
    });
    it('Übersicht der Einstellungen (mit Logout) bleibt für Terminal-Nutzer erreichbar', () => {
        expect(canAccessPath('/terminal/settings', ['/terminal'])).toBe(true);
        expect(canAccessPath('/terminal/settings', ['/'])).toBe(false);
    });
    it('API-Routen erben die Rechte ihrer Seiten', () => {
        expect(canAccessPath('/api/scale', ['/terminal'])).toBe(true);
        expect(canAccessPath('/api/scale/calibrate', ['/terminal'])).toBe(false);
        expect(canAccessPath('/api/fetch-image', ['/addarticle'])).toBe(true);
        expect(canAccessPath('/api/apply-category-structure', ['/addarticle'])).toBe(false);
        expect(canAccessPath('/api/apply-category-structure', ['/einstellungen/category'])).toBe(true);
    });
});

import { describeUserAgent } from '../userAgent.js';
describe('describeUserAgent', () => {
    it.each([
        ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Chrome auf Windows'],
        ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', 'Safari auf iPhone'],
        ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Gecko/20100101 Firefox/120.0', 'Firefox auf Mac'],
        ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 Edg/120.0', 'Edge auf Windows'],
        ['', 'Unbekanntes Gerät']
    ])('%#', (ua, expected) => expect(describeUserAgent(ua)).toBe(expected));
});
