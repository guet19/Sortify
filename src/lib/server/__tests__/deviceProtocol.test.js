import { describe, it, expect } from 'vitest';
import { encryptMessage, decryptMessage, newDeviceKey, commandFromDoc, envelope, commandTopic } from '../deviceProtocol.js';

describe('Geräte-Protokoll', () => {
    const key = newDeviceKey();
    const topic = commandTopic('sortify', 'abc');

    it('verschlüsselt und entschlüsselt Nachrichten', () => {
        const msg = envelope({ t: 'led', drawers: [3], color: '#00ff00', mode: 'solid' });
        expect(decryptMessage(key, topic, encryptMessage(key, topic, msg))).toEqual(msg);
    });

    it('lehnt fremde Schlüssel, fremde Topics und veränderte Daten ab', () => {
        const payload = encryptMessage(key, topic, envelope({ t: 'weigh', id: '1' }));
        expect(() => decryptMessage(newDeviceKey(), topic, payload)).toThrow();
        expect(() => decryptMessage(key, commandTopic('sortify', 'xyz'), payload)).toThrow();
        const tampered = Buffer.from(payload); tampered[14] ^= 1;
        expect(() => decryptMessage(key, topic, tampered)).toThrow();
    });

    it('übersetzt Datenbank-Befehle', () => {
        expect(commandFromDoc('hardware_commands', { _id: 'a', drawer_ids: [4, 12], color: 'blue', mode: 'solid' }))
            .toEqual({ t: 'led', drawers: [4, 12], color: 'blue', mode: 'solid' });
        expect(commandFromDoc('scale_requests', { _id: 'b' })).toEqual({ t: 'weigh', id: 'b' });
        expect(commandFromDoc('scale_requests', { _id: 'c', command: 'calibrate_ratio', weight: 500 }))
            .toEqual({ t: 'calibrate_ratio', id: 'c', weight: 500 });
    });
});

import { terminalState, versionAtLeast, versionFromUserAgent } from '../deviceProtocol.js';
describe('Erreichbarkeit des Terminals', () => {
    const now = 1_000_000_000;
    const v = '2.1.0';
    it('vergleicht Versionen', () => {
        expect(versionAtLeast('2.1.0', '2.1.0')).toBe(true);
        expect(versionAtLeast('2.0.9', '2.1.0')).toBe(false);
        expect(versionAtLeast('10.0.0', '2.1.0')).toBe(true);
        expect(versionAtLeast(null, '2.1.0')).toBe(false);
        expect(versionFromUserAgent('SortifyTerminal/2.1.0')).toBe('2.1.0');
        expect(versionFromUserAgent('Mozilla/5.0')).toBeNull();
    });
    it('frische Meldung = verbunden, ohne Ping', () => {
        expect(terminalState({ now, lastSeenAt: now - 30_000, version: v })).toEqual({ state: 'online', sendPing: false });
    });
    it('alte Meldung: anpingen und prüfen', () => {
        expect(terminalState({ now, lastSeenAt: now - 120_000, version: v })).toEqual({ state: 'checking', sendPing: true });
        expect(terminalState({ now, lastSeenAt: now - 120_000, lastPingAt: now - 3_000, version: v })).toEqual({ state: 'checking', sendPing: false });
    });
    it('Ping unbeantwortet = nicht erreichbar, später erneut anpingen', () => {
        expect(terminalState({ now, lastSeenAt: now - 120_000, lastPingAt: now - 10_000, version: v })).toEqual({ state: 'offline', sendPing: false });
        expect(terminalState({ now, lastSeenAt: now - 120_000, lastPingAt: now - 25_000, version: v })).toEqual({ state: 'offline', sendPing: true });
    });
    it('Antwort auf den Ping = verbunden', () => {
        expect(terminalState({ now, lastSeenAt: now - 1_000, lastPingAt: now - 2_000, version: v }).state).toBe('online');
    });
    it('unbeantworteter Ping hat Vorrang vor einer erst kurz zurückliegenden Meldung', () => {
        // Terminal vor 30 s zuletzt gemeldet, seit 10 s keine Antwort auf den Ping -> offline
        expect(terminalState({ now, lastSeenAt: now - 30_000, lastPingAt: now - 10_000, version: v }).state).toBe('offline');
        expect(terminalState({ now, lastSeenAt: now - 30_000, lastPingAt: now - 3_000, version: v }).state).toBe('checking');
    });
    it('Neuladen/Klick prüft echt: Meldung älter als 10 s -> neu anpingen', () => {
        expect(terminalState({ now, lastSeenAt: now - 30_000, version: v, freshMs: 10_000 })).toEqual({ state: 'checking', sendPing: true });
        expect(terminalState({ now, lastSeenAt: now - 5_000, version: v, freshMs: 10_000 })).toEqual({ state: 'online', sendPing: false });
        // Hintergrund-Abfrage: 30 s alte Meldung reicht
        expect(terminalState({ now, lastSeenAt: now - 30_000, version: v }).state).toBe('online');
    });
    it('ältere Terminal-Software: Status über das Lebenszeichen', () => {
        expect(terminalState({ now, lastSeenAt: now - 10 * 60_000, version: '2.0.0' })).toEqual({ state: 'online', sendPing: false, outdated: true });
        expect(terminalState({ now, lastSeenAt: now - 20 * 60_000, version: null })).toEqual({ state: 'offline', sendPing: false, outdated: true });
    });
});
