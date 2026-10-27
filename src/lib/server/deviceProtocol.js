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

// ---------- Erreichbarkeit des Terminals ----------
// Terminals ab Version 2.1.0 beantworten einen "ping" sofort per HTTPS (/api/device/pong).
export const PING_MIN_VERSION = '2.1.0';
export const STATUS_TIMING = {
    freshMs: 60_000,          // so lange gilt eine Meldung des Terminals als "verbunden"
    pingTimeoutMs: 8_000,     // ohne Antwort nach dieser Zeit: "nicht erreichbar"
    repingMs: 20_000,         // frühestens dann erneut anpingen (z.B. wenn es offline war)
    legacyWindowMs: 16 * 60_000 // ältere Terminals: Lebenszeichen alle 15 Minuten
};

// "2.0.0" < "2.1.0"; fehlende Version = alt
export function versionAtLeast(version, minimum) {
    const parse = (v) => String(v || '0').split('.').map((n) => parseInt(n, 10) || 0);
    const [a, b] = [parse(version), parse(minimum)];
    for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
    return true;
}

// Version aus dem User-Agent des Terminals ("SortifyTerminal/2.1.0")
export function versionFromUserAgent(userAgent) {
    return String(userAgent || '').match(/SortifyTerminal\/(\d+\.\d+\.\d+)/)?.[1] || null;
}

// Entscheidet anhand der Zeitstempel (ms), wie der Status lautet und ob jetzt ein Ping nötig ist.
// state: 'online' | 'checking' | 'offline'
// freshMs: wie alt die letzte Meldung höchstens sein darf, damit ohne Ping "online" gilt
//          (Hintergrund-Abfrage: 60 s; Neuladen/Klick: 10 s, damit sofort echt geprüft wird)
export function terminalState({ now, lastSeenAt, lastPingAt, version, freshMs }, t = STATUS_TIMING) {
    const seen = lastSeenAt || 0, pinged = lastPingAt || 0;
    if (!versionAtLeast(version, PING_MIN_VERSION)) {
        return { state: now - seen < t.legacyWindowMs ? 'online' : 'offline', sendPing: false, outdated: true };
    }
    // Ein unbeantworteter Ping hat Vorrang: Wer gefragt wurde und nicht antwortet, ist nicht erreichbar
    const pending = pinged > seen;
    if (pending && now - pinged < t.pingTimeoutMs) return { state: 'checking', sendPing: false };
    if (pending) return { state: 'offline', sendPing: now - pinged >= t.repingMs };
    if (now - seen < (freshMs ?? t.freshMs)) return { state: 'online', sendPing: false };
    return { state: 'checking', sendPing: true };
}
