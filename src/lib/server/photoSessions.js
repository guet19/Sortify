// Fotos vom Smartphone an den PC übertragen (Artikel anlegen/bearbeiten).
// Der PC erzeugt eine Sitzung und zeigt einen QR-Code mit einem zufälligen Einmal-Schlüssel (15 Min. gültig).
// Das Handy lädt damit Fotos hoch – ohne Anmeldung, aber nur für genau diese Sitzung.
// Die Fotos liegen nur kurz in der Datenbank und werden gelöscht, sobald der PC sie abgeholt hat.
// Collections: photo_sessions { tokenHash, systemId, userId, uploaded, createdAt, expiresAt }
//              photo_session_images { sessionId, systemId, data, contentType, size, createdAt, expiresAt }
import { ObjectId, Binary } from 'mongodb';
import db from '$lib/server/db.js';
import { generateToken, hashToken } from '$lib/server/security.js';
import { PHOTO_SESSION_MINUTES, photoUploadError, sniffImageType } from '$lib/photoUpload.js';

const collections = async () => {
    const database = await db.getDb();
    return { sessions: database.collection('photo_sessions'), images: database.collection('photo_session_images') };
};
const oid = (id) => (ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : null);

export async function createPhotoSession({ systemId, userId }) {
    const { sessions, images } = await collections();
    const now = new Date();
    // Abgelaufene Sitzungen dieses Nutzers gleich mit aufräumen (falls der Löschindex fehlt)
    const stale = await sessions.find({ userId: oid(userId), expiresAt: { $lt: now } }, { projection: { _id: 1 } }).toArray();
    if (stale.length) {
        const ids = stale.map((s) => s._id);
        await Promise.all([sessions.deleteMany({ _id: { $in: ids } }), images.deleteMany({ sessionId: { $in: ids } })]);
    }

    const token = generateToken();
    const expiresAt = new Date(now.getTime() + PHOTO_SESSION_MINUTES * 60 * 1000);
    const { insertedId } = await sessions.insertOne({
        tokenHash: hashToken(token), systemId: oid(systemId), userId: oid(userId), uploaded: 0, createdAt: now, expiresAt
    });
    return { id: insertedId.toString(), token, expiresAt };
}

// Sitzung des angemeldeten Nutzers (PC-Seite)
async function ownSession(id, { systemId, userId }) {
    const { sessions } = await collections();
    const sessionId = oid(id);
    if (!sessionId) return null;
    return sessions.findOne({ _id: sessionId, systemId: oid(systemId), userId: oid(userId) });
}

export async function getPhotoSessionStatus(id, owner) {
    const session = await ownSession(id, owner);
    if (!session) return null;
    if (session.expiresAt < new Date()) return { status: 'expired', photos: [] };
    const { images } = await collections();
    const photos = await images.find({ sessionId: session._id }, { projection: { _id: 1 } }).sort({ createdAt: 1 }).toArray();
    return { status: 'active', photos: photos.map((p) => p._id.toString()), uploaded: session.uploaded, expiresAt: session.expiresAt.toISOString() };
}

// Foto abholen – danach wird es gelöscht
export async function takePhoto(id, photoId, owner) {
    const session = await ownSession(id, owner);
    const imageId = oid(photoId);
    if (!session || !imageId) return null;
    const { images } = await collections();
    const image = await images.findOneAndDelete({ _id: imageId, sessionId: session._id });
    if (!image) return null;
    return { contentType: image.contentType, data: Buffer.from(image.data.buffer) };
}

export async function closePhotoSession(id, owner) {
    const session = await ownSession(id, owner);
    if (!session) return false;
    const { sessions, images } = await collections();
    await Promise.all([sessions.deleteOne({ _id: session._id }), images.deleteMany({ sessionId: session._id })]);
    return true;
}

// ---------- Handy-Seite (ohne Anmeldung, nur mit dem Schlüssel aus dem QR-Code) ----------

export async function photoSessionFromToken(token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
    const { sessions } = await collections();
    const session = await sessions.findOne({ tokenHash: hashToken(token) });
    if (!session || session.expiresAt < new Date()) return null;
    return session;
}

// Liefert { ok: true } oder { error, status }
export async function addPhoto(token, bytes) {
    const session = await photoSessionFromToken(token);
    if (!session) return { error: 'Der QR-Code ist abgelaufen. Bitte am Computer einen neuen erzeugen.', status: 410 };
    const problem = photoUploadError(bytes, session.uploaded);
    if (problem) return { error: problem, status: 400 };

    const { sessions, images } = await collections();
    // Zähler zuerst erhöhen (verhindert, dass parallele Uploads das Limit überschreiten)
    const counted = await sessions.findOneAndUpdate(
        { _id: session._id, uploaded: session.uploaded },
        { $inc: { uploaded: 1 } },
        { returnDocument: 'after' }
    );
    if (!counted) return { error: 'Bitte das Foto erneut senden.', status: 409 };

    await images.insertOne({
        sessionId: session._id,
        systemId: session.systemId,
        data: new Binary(Buffer.from(bytes)),
        contentType: sniffImageType(bytes),
        size: bytes.length,
        createdAt: new Date(),
        expiresAt: session.expiresAt
    });
    return { ok: true, uploaded: counted.uploaded };
}
