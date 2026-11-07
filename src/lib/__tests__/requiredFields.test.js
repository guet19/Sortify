import { describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';
import { NOTICE_SECONDS, cleanFieldLabel, closeNotice, floatingNotice, missingFieldsMessage, showNotice } from '../requiredFields.js';

describe('Fehlende Pflichtangaben', () => {
    it('bereinigt Beschriftungen', () => {
        expect(cleanFieldLabel('Artikelbezeichnung *')).toBe('Artikelbezeichnung');
        expect(cleanFieldLabel('Name:')).toBe('Name');
        expect(cleanFieldLabel('Neuen Wert hinzufügen...')).toBe('Neuen Wert hinzufügen');
        expect(cleanFieldLabel('Titel\nweiterer Hinweistext')).toBe('Titel');
        expect(cleanFieldLabel(null)).toBe('');
    });

    it('nennt die fehlenden Felder', () => {
        expect(missingFieldsMessage(['Titel'])).toBe('Bitte noch ausfüllen: Titel');
        expect(missingFieldsMessage(['Titel', 'Beschreibung'])).toBe('Bitte noch ausfüllen: Titel und Beschreibung');
        expect(missingFieldsMessage(['A', 'B', 'C'])).toBe('Bitte noch ausfüllen: A, B und C');
        expect(missingFieldsMessage(['A', 'B', 'C', 'D', 'E'])).toBe('Bitte noch ausfüllen: A, B, C, D und 1 weiteres Feld');
        expect(missingFieldsMessage(['A', 'B', 'C', 'D', 'E', 'F'])).toBe('Bitte noch ausfüllen: A, B, C, D und 2 weitere Felder');
        expect(missingFieldsMessage(['Titel', 'Titel', ''])).toBe('Bitte noch ausfüllen: Titel');
        expect(missingFieldsMessage([''])).toBe('Bitte alle Pflichtfelder ausfüllen.');
    });

    it('verschwindet nach kurzer Zeit, ein neuer Hinweis beginnt von vorne', () => {
        vi.useFakeTimers();
        showNotice('Erster Hinweis');
        vi.advanceTimersByTime((NOTICE_SECONDS - 1) * 1000);
        expect(get(floatingNotice).text).toBe('Erster Hinweis');
        showNotice('Zweiter Hinweis');
        vi.advanceTimersByTime((NOTICE_SECONDS - 1) * 1000);
        expect(get(floatingNotice).text).toBe('Zweiter Hinweis');
        vi.advanceTimersByTime(1000);
        expect(get(floatingNotice)).toBeNull();
        showNotice('Dritter Hinweis');
        closeNotice();
        expect(get(floatingNotice)).toBeNull();
        vi.useRealTimers();
    });
});
