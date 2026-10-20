// Terminals (Raspberry Pi): Kopplung, Geräte-Token und Versand der Befehle.
// Ein Terminal kennt nur sein Geräte-Token (für die HTTPS-API) und seinen Schlüssel
// (für die MQTT-Nachrichten) – keine Datenbank-Zugangsdaten.
import { ObjectId } from 'mongodb';
import crypto from 'crypto';
import db from '$lib/server/db.js';
import { hashToken } from '$lib/server/security.js';
import { publish, topicPrefix, isMqttConfigured } from '$lib/server/mqtt.js';
import { newDeviceToken, newDeviceKey, newTopicId, commandTopic, encryptMessage, envelope, commandFromDoc } from '$lib/server/deviceProtocol.js';

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
    await devices.insertOne({
        systemId: new ObjectId(systemId),
        name: 'Terminal',
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
}

export async function getSystemDevices(systemId) {
    const { devices } = await collections();
    return devices.find({ systemId: new ObjectId(systemId) }, { projection: { tokenHash: 0, key: 0 } }).toArray();
}

// Terminal(s) eines Lagers entfernen – das Terminal erfährt es sofort und startet die Kopplung neu
export async function removeSystemDevices(systemId) {
    await dispatchToSystem(systemId, { t: 'unpaired' });
    const { devices } = await collections();
    await devices.deleteMany({ systemId: new ObjectId(systemId) });
}

// ---------- Anfragen der Terminals (HTTPS) ----------

// Prüft "Authorization: Bearer <Geräte-Token>" und liefert das Gerät
export async function deviceFromRequest(request) {
    const header = request.headers.get('authorization') || '';
    const match = header.match(/^Bearer (sd_[A-Za-z0-9_-]{20,100})$/);
    if (!match) return null;
    const { devices } = await collections();
    const device = await devices.findOne({ tokenHash: hashToken(match[1]) });
    if (!device) return null;
    // "Zuletzt gesehen" höchstens alle 5 Minuten speichern
    if (!device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > 5 * 60 * 1000) {
        devices.updateOne({ _id: device._id }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
    }
    return device;
}

// Rückmeldung zu einem Waagen- oder Kalibrier-Auftrag – nur für Aufträge des eigenen Lagers
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
        { _id: new ObjectId(String(id)), systemId: device.systemId, status: { $in: ['pending', 'processing'] } },
        { $set: set }
    );
    return result.matchedCount > 0;
}

// ---------- Befehle an die Terminals ----------

// Schickt eine Nachricht verschlüsselt an alle Terminals eines Lagers
export async function dispatchToSystem(systemId, body) {
    if (!isMqttConfigured() || !body) return 0;
    try {
        const { devices } = await collections();
        const targets = await devices.find({ systemId: new ObjectId(systemId) }, { projection: { key: 1, topic: 1 } }).toArray();
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
export const dispatchCommandDoc = (collection, doc) => dispatchToSystem(doc.systemId, commandFromDoc(collection, doc));
