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
