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
