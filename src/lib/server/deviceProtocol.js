// Protokoll zwischen Sortify und den Terminals (Raspberry Pi).
// Befehle laufen über einen MQTT-Broker. Jede Nachricht ist mit dem Schlüssel des Geräts
// verschlüsselt und signiert (AES-256-GCM): Der Broker und andere Geräte können sie weder
// lesen noch fälschen. Als Zusatzdaten (AAD) dient das Topic – eine Nachricht für Gerät A
// ist für Gerät B wertlos. Gegenstück: terminal/sortify_terminal.py
import crypto from 'crypto';

export const PROTOCOL_VERSION = 1;

export const newDeviceToken = () => 'sd_' + crypto.randomBytes(32).toString('base64url');
export const newDeviceKey = () => crypto.randomBytes(32).toString('base64');
export const newTopicId = () => crypto.randomBytes(16).toString('hex');

export const commandTopic = (prefix, topicId) => `${prefix}/d/${topicId}/cmd`;

// Nachricht -> nonce(12) | Chiffretext | Tag(16)
export function encryptMessage(keyB64, topic, message) {
    const key = Buffer.from(keyB64, 'base64');
    if (key.length !== 32) throw new Error('Ungültiger Geräteschlüssel');
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(topic, 'utf8'));
    const body = Buffer.concat([cipher.update(JSON.stringify(message), 'utf8'), cipher.final()]);
    return Buffer.concat([nonce, body, cipher.getAuthTag()]);
}

// Nur für Tests (die Geräte entschlüsseln in Python)
export function decryptMessage(keyB64, topic, payload) {
    const key = Buffer.from(keyB64, 'base64');
    const nonce = payload.subarray(0, 12);
    const tag = payload.subarray(payload.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(Buffer.from(topic, 'utf8'));
    decipher.setAuthTag(tag);
    const text = Buffer.concat([decipher.update(payload.subarray(12, payload.length - 16)), decipher.final()]);
    return JSON.parse(text.toString('utf8'));
}

// Hülle jeder Nachricht: eindeutige ID + Zeitstempel (das Gerät verwirft alte oder doppelte Nachrichten)
export function envelope(body, now = Date.now()) {
    return { v: PROTOCOL_VERSION, mid: crypto.randomBytes(8).toString('hex'), ts: now, ...body };
}

// Übersetzt ein Datenbank-Dokument (hardware_commands / scale_requests) in eine Geräte-Nachricht
export function commandFromDoc(collection, doc) {
    const id = doc._id ? String(doc._id) : undefined;
    const command = String(doc.command || '').toLowerCase();
    if (command === 'calibrate_zero' || command === 'calibrate_ratio') {
        return { t: command, id, weight: Number(doc.weight) || 0 };
    }
    if (collection === 'scale_requests') return { t: 'weigh', id };
    if (collection === 'hardware_commands') {
        return {
            t: 'led',
            drawers: (doc.drawer_ids || []).map(Number).filter(Number.isFinite),
            color: typeof doc.color === 'string' ? doc.color : '#00ff00',
            mode: doc.mode === 'solid' ? 'solid' : 'blink'
        };
    }
    return null;
}
