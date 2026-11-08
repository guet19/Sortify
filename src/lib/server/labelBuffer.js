// Zwischenspeicher der Etikettenprüfung, pro Lager (siehe $lib/labelBuffer.js).
// Collection label_checks { systemId, code, free, at, by } – free: Ergebnis der Prüfung gegen Regale und Artikel
import { ObjectId } from 'mongodb';
import db from '$lib/server/db.js';
import { MAX_LABELS } from '$lib/labelBuffer.js';

const collection = async () => (await db.getDb()).collection('label_checks');
const NEWEST_FIRST = { at: -1, _id: -1 };

const toPlain = (doc) => ({ id: doc._id.toString(), code: doc.code, free: !!doc.free, at: doc.at.toISOString(), by: doc.by || '' });

// Neueste zuerst
export async function listLabels(systemId) {
    const rows = await (await collection()).find({ systemId: new ObjectId(systemId) }).sort(NEWEST_FIRST).limit(MAX_LABELS).toArray();
    return rows.map(toPlain);
}

// Liefert die ID des neuen Eintrags. Über der Höchstzahl fallen die ältesten weg.
export async function addLabel(systemId, { code, free, by = '' }) {
    const labels = await collection();
    const system = new ObjectId(systemId);
    const { insertedId } = await labels.insertOne({ systemId: system, code, free: !!free, at: new Date(), by });
    const overflow = await labels.find({ systemId: system }, { projection: { _id: 1 } }).sort(NEWEST_FIRST).skip(MAX_LABELS).toArray();
    if (overflow.length) await labels.deleteMany({ _id: { $in: overflow.map((d) => d._id) } });
    return insertedId.toString();
}

// Nur Einträge des eigenen Lagers
export async function forgetLabel(systemId, id) {
    if (!ObjectId.isValid(String(id))) return false;
    const result = await (await collection()).deleteOne({ _id: new ObjectId(String(id)), systemId: new ObjectId(systemId) });
    return result.deletedCount > 0;
}

export async function clearLabels(systemId) {
    return (await (await collection()).deleteMany({ systemId: new ObjectId(systemId) })).deletedCount;
}
