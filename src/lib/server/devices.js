// Terminals (Raspberry Pi): Kopplung, Geräte-Token und Versand der Befehle.
// Ein Terminal kennt nur sein Geräte-Token (für die HTTPS-API) und seinen Schlüssel
// (für die MQTT-Nachrichten) – keine Datenbank-Zugangsdaten.
import { ObjectId } from 'mongodb';
import crypto from 'crypto';
import db from '$lib/server/db.js';
import { hashToken } from '$lib/server/security.js';
import { publish, topicPrefix, isMqttConfigured } from '$lib/server/mqtt.js';
import { newDeviceToken, newDeviceKey, newTopicId, commandTopic, encryptMessage, envelope, commandFromDoc, terminalState, versionFromUserAgent } from '$lib/server/deviceProtocol.js';
import { cookieOptions } from '$lib/server/session.js';
import { TERMINAL_COOKIE, scaleTerminalId, cleanTerminalName, nextTerminalName } from '$lib/terminals.js';

const PAIRING_TTL_MS = 10 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne 0/O und 1/I

const collections = async () => {
    const database = await db.getDb();
    return { pairings: database.collection('device_pairings'), devices: database.collection('devices') };
};

export function generatePairingCode(length = 8) {
    return Array.from({ length }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
}

// ---------- Kopplung (vom Terminal aus) ----------

// Schritt 1: Terminal meldet sich an und zeigt den Code an
export async function startPairing() {
    const { pairings } = await collections();
    const secret = crypto.randomBytes(24).toString('base64url');
    const now = new Date();
    const code1 = generatePairingCode();
    const { insertedId } = await pairings.insertOne({
        viaApi: true,
        code1,
        code2: null,
        status: 'waiting_for_web',
        secretHash: hashToken(secret),
        systemId: null,
        createdAt: now,
        expiresAt: new Date(now.getTime() + PAIRING_TTL_MS)
    });
    return { pairingId: insertedId.toString(), secret, code: code1, expiresInSeconds: PAIRING_TTL_MS / 1000 };
}

async function findOwnPairing(pairingId, secret) {
    if (!ObjectId.isValid(String(pairingId)) || typeof secret !== 'string') return null;
    const { pairings } = await collections();
    const pairing = await pairings.findOne({ _id: new ObjectId(String(pairingId)), viaApi: true });
    if (!pairing || pairing.expiresAt < new Date()) return null;
    const expected = Buffer.from(pairing.secretHash, 'hex');
    const given = Buffer.from(hashToken(secret), 'hex');
    return expected.length === given.length && crypto.timingSafeEqual(expected, given) ? pairing : null;
}

// Terminal fragt den Stand ab. Nach erfolgreicher Kopplung werden die Zugangsdaten
// genau einmal ausgeliefert und danach gelöscht.
export async function pollPairing(pairingId, secret) {
    const pairing = await findOwnPairing(pairingId, secret);
    if (!pairing) return { status: 'expired' };
    if (pairing.status === 'paired' && pairing.delivery) {
        const { pairings } = await collections();
        const { deletedCount } = await pairings.deleteOne({ _id: pairing._id, status: 'paired' });
        if (!deletedCount) return { status: 'expired' };
        return { status: 'paired', ...pairing.delivery };
    }
    return { status: pairing.status, code2: pairing.status === 'pi_confirmed' ? pairing.code2 : undefined };
}

// Schritt 2: Am Touch-Display "Erlauben" oder "Ablehnen"
export async function answerPairing(pairingId, secret, accept) {
    const pairing = await findOwnPairing(pairingId, secret);
    if (!pairing || pairing.status !== 'user_claimed') return { status: 'expired' };
    const { pairings } = await collections();
    if (!accept) {
        await pairings.deleteOne({ _id: pairing._id });
        return { status: 'rejected' };
    }
    const code2 = generatePairingCode();
    await pairings.updateOne(
        { _id: pairing._id, status: 'user_claimed' },
        { $set: { status: 'pi_confirmed', code2, expiresAt: new Date(Date.now() + PAIRING_TTL_MS) } }
    );
    return { status: 'pi_confirmed', code2 };
}

// ---------- Kopplung (von der Web-Oberfläche aus) ----------

// Schritt 3: Der Nutzer gibt Code 2 ein -> Gerät anlegen, Zugangsdaten für das Terminal bereitlegen
export async function completePairing(pairing, systemId, userId) {
    const { pairings, devices } = await collections();
    const token = newDeviceToken();
    const key = newDeviceKey();
    const topic = newTopicId();
    const now = new Date();
    const existing = await devices.find({ systemId: new ObjectId(systemId) }, { projection: { name: 1 } }).toArray();
    const { insertedId } = await devices.insertOne({
        systemId: new ObjectId(systemId),
        name: nextTerminalName(existing.map((d) => d.name || '')),
        tokenHash: hashToken(token),
        key,
        topic,
        pairedBy: userId ? new ObjectId(userId) : null,
        createdAt: now,
        lastSeenAt: null
    });
    await pairings.updateOne(
        { _id: pairing._id },
        { $set: { status: 'paired', systemId: String(systemId), delivery: { token, key, topic }, expiresAt: new Date(now.getTime() + PAIRING_TTL_MS) } }
    );
    return insertedId.toString();
}

export async function getSystemDevices(systemId) {
    const { devices } = await collections();
    return devices.find({ systemId: new ObjectId(systemId) }, { projection: { tokenHash: 0, key: 0 } }).toArray();
}

// Alle Terminals eines Lagers entfernen (z.B. beim Löschen des Lagers) – sie erfahren es sofort
// und starten die Kopplung neu
export async function removeSystemDevices(systemId) {
    await dispatchToSystem(systemId, { t: 'unpaired' });
    const { devices } = await collections();
    await devices.deleteMany({ systemId: new ObjectId(systemId) });
}

// ---------- Mehrere Terminals pro Lager ----------

const plainTerminal = (d) => ({
    id: d._id.toString(),
    name: d.name || 'Terminal',
    createdAt: d.createdAt?.toISOString() || null,
    lastSeenAt: d.lastSeenAt?.toISOString() || null,
    softwareVersion: d.softwareVersion || null
});

// Terminals eines Lagers, das zuerst gekoppelte zuerst (Standard für Regale ohne Zuordnung)
export async function listTerminals(systemId) {
    const { devices } = await collections();
    const rows = await devices.find({ systemId: new ObjectId(systemId) }, { projection: { tokenHash: 0, key: 0 } })
        .sort({ createdAt: 1, _id: 1 }).toArray();
    return rows.map(plainTerminal);
}

// Welches Terminal steht bei diesem Browser? (wird bei jeder Verwendung gegen die Terminals des Lagers geprüft)
export function selectedTerminalId(cookies) {
    const value = cookies.get(TERMINAL_COOKIE);
    return value && ObjectId.isValid(value) ? value : null;
}

export async function rememberTerminal(cookies, systemId, terminalId) {
    const terminals = await listTerminals(systemId);
    if (!terminals.some((t) => t.id === terminalId)) return false;
    cookies.set(TERMINAL_COOKIE, terminalId, cookieOptions(60 * 60 * 24 * 365));
    return true;
}

// Ziel für Waage und Kalibrierung: { deviceId } (null = altes Terminal mit Datenbankzugriff) oder { error }.
// barcode: Fach, um das es geht – hilft, wenn der Browser noch kein Terminal gewählt hat
export async function scaleTarget(systemId, cookies, { barcode = null } = {}) {
    const terminals = await listTerminals(systemId);
    if (terminals.length === 0) return { deviceId: null };
    let shelf = null;
    if (barcode && terminals.length > 1) {
        shelf = await (await db.getDb()).collection('shelves')
            .findOne({ systemId: new ObjectId(systemId), 'drawers.barcode': String(barcode) }, { projection: { deviceId: 1 } });
    }
    const deviceId = scaleTerminalId(terminals, { selectedId: selectedTerminalId(cookies), shelf });
    return deviceId ? { deviceId } : { error: 'Bitte zuerst oben wählen, an welchem Terminal du stehst.' };
}

export async function renameTerminal(systemId, terminalId, name) {
    const clean = cleanTerminalName(name);
    if (!clean) return { error: 'Bitte einen Namen eingeben.' };
    if (!ObjectId.isValid(String(terminalId))) return { error: 'Terminal nicht gefunden.' };
    const { devices } = await collections();
    const result = await devices.updateOne({ _id: new ObjectId(String(terminalId)), systemId: new ObjectId(systemId) }, { $set: { name: clean } });
    return result.matchedCount === 1 ? { ok: true } : { error: 'Terminal nicht gefunden.' };
}

// Ein Terminal entfernen: Es erfährt es sofort und startet die Kopplung neu.
// Seine Regale fallen an das Standard-Terminal zurück (bis sie neu zugeordnet werden).
export async function removeTerminal(systemId, terminalId) {
    if (!ObjectId.isValid(String(terminalId))) return false;
    const id = new ObjectId(String(terminalId));
    const { devices } = await collections();
    const device = await devices.findOne({ _id: id, systemId: new ObjectId(systemId) }, { projection: { _id: 1 } });
    if (!device) return false;
    await dispatchToSystem(systemId, { t: 'unpaired' }, { deviceId: id });
    await devices.deleteOne({ _id: id });
    await (await db.getDb()).collection('shelves').updateMany({ systemId: new ObjectId(systemId), deviceId: id }, { $unset: { deviceId: '' } });
    return true;
}

// "Welches Gerät ist das?": Die ersten LEDs dieses Terminals blinken kurz weiss
export async function identifyTerminal(systemId, terminalId) {
    if (!ObjectId.isValid(String(terminalId))) return 0;
    const deviceId = new ObjectId(String(terminalId));
    const sent = await dispatchToSystem(systemId, { t: 'led', drawers: [1, 2, 3, 4, 5, 6, 7, 8], color: '#ffffff', mode: 'blink' }, { deviceId });
    if (sent) setTimeout(() => dispatchToSystem(systemId, { t: 'led', drawers: [0] }, { deviceId }).catch(() => {}), 8000);
    return sent;
}

// ---------- Anfragen der Terminals (HTTPS) ----------

// Prüft "Authorization: Bearer <Geräte-Token>" und liefert das Gerät.
// Merkt sich dabei "zuletzt gesehen" (höchstens jede Minute; force = sofort, z.B. Antwort auf einen Ping)
// und die Software-Version des Terminals aus dem User-Agent.
export async function deviceFromRequest(request, { force = false } = {}) {
    const header = request.headers.get('authorization') || '';
    const match = header.match(/^Bearer (sd_[A-Za-z0-9_-]{20,100})$/);
    if (!match) return null;
    const { devices } = await collections();
    const device = await devices.findOne({ tokenHash: hashToken(match[1]) });
    if (!device) return null;

    const version = versionFromUserAgent(request.headers.get('user-agent'));
    const stale = !device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > 60 * 1000;
    if (force || stale || (version && version !== device.softwareVersion)) {
        const update = devices.updateOne({ _id: device._id }, { $set: { lastSeenAt: new Date(), ...(version ? { softwareVersion: version } : {}) } });
        if (force) await update; else update.catch(() => {});
    }
    return device;
}

// Ist das Terminal dieses Browsers gerade erreichbar? Pingt es bei Bedarf über MQTT an;
// die Antwort (/api/device/pong) setzt "zuletzt gesehen" – der nächste Aufruf meldet dann "online".
// fresh: true bei Neuladen/Klick – dann wird schon nach 10 s ohne Meldung neu angepingt
// selectedId: im Browser gewähltes Terminal; bei mehreren Terminals ohne Wahl -> state 'choose'
export async function getTerminalStatus(systemId, { fresh = false, selectedId = null } = {}) {
    const { devices, pairings } = await collections();
    const all = await devices.find({ systemId: new ObjectId(systemId) }).sort({ createdAt: 1, _id: 1 }).toArray();
    if (all.length === 0) {
        // Terminal mit altem Code (direkter Datenbankzugriff) lässt sich nicht prüfen
        const legacy = await pairings.findOne({ systemId: String(systemId), status: 'paired', viaApi: { $ne: true } });
        return { state: legacy ? 'unknown' : 'unpaired' };
    }
    const terminals = all.map((d) => ({ id: d._id.toString(), name: d.name || 'Terminal' }));
    const device = all.find((d) => d._id.toString() === selectedId) || (all.length === 1 ? all[0] : null);
    if (!device) return { state: 'choose', terminals };
    const terminal = { id: device._id.toString(), name: device.name || 'Terminal' };
    if (!isMqttConfigured()) return { state: 'unknown', lastSeenAt: device.lastSeenAt?.toISOString() || null, terminal, terminals };

    const result = terminalState({
        now: Date.now(),
        lastSeenAt: device.lastSeenAt?.getTime(),
        lastPingAt: device.lastPingAt?.getTime(),
        version: device.softwareVersion,
        freshMs: fresh ? 10_000 : undefined
    });
    if (result.sendPing) {
        await devices.updateOne({ _id: device._id }, { $set: { lastPingAt: new Date() } });
        await dispatchToSystem(systemId, { t: 'ping' }, { deviceId: device._id });
    }
    return { state: result.state, outdated: !!result.outdated, lastSeenAt: device.lastSeenAt?.toISOString() || null, terminal, terminals };
}

// Rückmeldung zu einem Waagen- oder Kalibrier-Auftrag – nur für Aufträge des eigenen Lagers,
// die an dieses Terminal gingen (bzw. an kein bestimmtes)
export async function acknowledgeCommand(device, { id, status, weight }) {
    if (!ObjectId.isValid(String(id))) return false;
    const newStatus = ['processing', 'done', 'error'].includes(status) ? status : 'done';
    const set = { status: newStatus, answeredBy: device._id, answeredAt: new Date() };
    if (newStatus === 'done' && weight !== undefined && weight !== null) {
        const value = Number(weight);
        if (!Number.isFinite(value) || Math.abs(value) > 1e7) return false;
        set.weight = value;
    }
    const database = await db.getDb();
    const result = await database.collection('scale_requests').updateOne(
        {
            _id: new ObjectId(String(id)), systemId: device.systemId, status: { $in: ['pending', 'processing'] },
            $or: [{ deviceId: { $exists: false } }, { deviceId: null }, { deviceId: device._id }]
        },
        { $set: set }
    );
    return result.matchedCount > 0;
}

// ---------- Befehle an die Terminals ----------

// Schickt eine Nachricht verschlüsselt an alle Terminals eines Lagers – oder nur an eines (deviceId)
export async function dispatchToSystem(systemId, body, { deviceId = null } = {}) {
    if (!isMqttConfigured() || !body) return 0;
    try {
        const { devices } = await collections();
        const filter = { systemId: new ObjectId(systemId) };
        if (deviceId) filter._id = new ObjectId(String(deviceId));
        const targets = await devices.find(filter, { projection: { key: 1, topic: 1 } }).toArray();
        const results = await Promise.all(targets.map((device) => {
            const topic = commandTopic(topicPrefix(), device.topic);
            return publish(topic, encryptMessage(device.key, topic, envelope(body)));
        }));
        return results.filter(Boolean).length;
    } catch (error) {
        console.error('Befehl konnte nicht an die Terminals gesendet werden:', error?.message || error);
        return 0;
    }
}

// Für db.js: neues Dokument in hardware_commands / scale_requests an die Terminals weiterleiten
// (mit deviceId nur an dieses Terminal, sonst an alle des Lagers)
export const dispatchCommandDoc = (collection, doc) => dispatchToSystem(doc.systemId, commandFromDoc(collection, doc), { deviceId: doc.deviceId || null });
