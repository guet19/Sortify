// Gleiche Indizes wie scripts/create-indexes.js – zum direkten Einfügen in die MongoDB-Shell
// (MongoDB Compass -> unten "MONGOSH" oder mongosh im Terminal).
// Bereits vorhandene Indizes mit gleichem Namen werden einfach übersprungen.

const sortify = db.getSiblingDB('Sortify_Prod');

const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const onlyStrings = (field) => ({ partialFilterExpression: { [field]: { $type: 'string' } } });

const INDEXES = {
    users: [
        [{ email: 1 }, { name: 'email_unique', unique: true, ...onlyStrings('email') }],
        [{ email: 1, _id: 1 }, { name: 'email_lookup' }],
        [{ username: 1 }, { name: 'username_unique', unique: true, ...onlyStrings('username') }],
        [{ username: 1, _id: 1 }, { name: 'username_lookup' }],
        [{ 'systems.systemId': 1 }, { name: 'systems_systemId' }],
        [{ resetToken: 1 }, { name: 'resetToken', sparse: true }],
        [{ verificationToken: 1 }, { name: 'verificationToken', sparse: true }],
        [{ emailChangeToken: 1 }, { name: 'emailChangeToken', sparse: true }],
        [{ passwordChangeToken: 1 }, { name: 'passwordChangeToken', sparse: true }]
    ],
    sessions: [
        [{ tokenHash: 1 }, { name: 'tokenHash_unique', unique: true }],
        [{ userId: 1 }, { name: 'userId' }],
        [{ expiresAt: 1 }, { name: 'ttl_expiresAt', expireAfterSeconds: 0 }]
    ],
    rate_limits: [
        [{ key: 1 }, { name: 'key_unique', unique: true }],
        [{ expiresAt: 1 }, { name: 'ttl_expiresAt', expireAfterSeconds: 0 }]
    ],
    loginAttempts: [
        [{ ip: 1 }, { name: 'ip' }],
        // Bestehender Index in der Datenbank: nach 3 Tagen löschen
        [{ createdAt: 1 }, { name: 'createdAt_1', expireAfterSeconds: 3 * DAY }]
    ],
    sessionLogs: [
        [{ sessionId: 1 }, { name: 'sessionId' }],
        // Anmelde-Protokolle nach 180 Tagen löschen
        [{ createdAt: 1 }, { name: 'createdAt_1', expireAfterSeconds: 180 * DAY }]
    ],
    systems: [
        [{ createdBy: 1 }, { name: 'createdBy' }]
    ],
    articles: [
        [{ systemId: 1, createdAt: -1 }, { name: 'systemId_createdAt' }],
        [{ systemId: 1, 'assigned_barcodes.barcode': 1 }, { name: 'systemId_barcode' }],
        // Prüfung, ob ein Bild noch verwendet wird (vor dem Löschen bei Cloudinary)
        [{ images: 1 }, { name: 'images' }],
        [{ imagePath: 1 }, { name: 'imagePath' }]
    ],
    shelves: [
        [{ systemId: 1, start_index: 1 }, { name: 'systemId_startIndex' }],
        [{ systemId: 1, 'drawers.barcode': 1 }, { name: 'systemId_drawerBarcode' }]
    ],
    categories: [
        [{ systemId: 1 }, { name: 'systemId' }]
    ],
    filter_attributes: [
        [{ systemId: 1 }, { name: 'systemId' }]
    ],
    stock_movements: [
        [{ systemId: 1, articleId: 1, createdAt: -1 }, { name: 'systemId_article_createdAt' }],
        [{ systemId: 1, createdAt: -1 }, { name: 'systemId_createdAt' }],
        // Bewegungsprotokoll nach 2 Jahren löschen
        [{ createdAt: 1 }, { name: 'ttl_createdAt', expireAfterSeconds: 730 * DAY }]
    ],
    projects: [
        [{ systemId: 1, parentId: 1 }, { name: 'systemId_parentId' }]
    ],
    project_bookings: [
        [{ systemId: 1, rootProjectId: 1, createdAt: -1 }, { name: 'systemId_root_createdAt' }],
        [{ systemId: 1, projectId: 1, createdAt: -1 }, { name: 'systemId_project_createdAt' }]
    ],
    photo_sessions: [
        [{ tokenHash: 1 }, { name: 'tokenHash_unique', unique: true }],
        [{ expiresAt: 1 }, { name: 'ttl_expiresAt', expireAfterSeconds: 0 }]
    ],
    photo_session_images: [
        [{ sessionId: 1, createdAt: 1 }, { name: 'sessionId_createdAt' }],
        [{ expiresAt: 1 }, { name: 'ttl_expiresAt', expireAfterSeconds: 0 }]
    ],
    hardware_commands: [
        [{ systemId: 1, status: 1 }, { name: 'systemId_status' }],
        [{ createdAt: 1 }, { name: 'ttl_createdAt', expireAfterSeconds: DAY }]
    ],
    scale_requests: [
        [{ systemId: 1, status: 1 }, { name: 'systemId_status' }],
        [{ createdAt: 1 }, { name: 'ttl_createdAt', expireAfterSeconds: HOUR }]
    ],
    device_pairings: [
        [{ systemId: 1, status: 1 }, { name: 'systemId_status' }],
        [{ code1: 1, status: 1 }, { name: 'code1_status' }],
        [{ expiresAt: 1 }, { name: 'ttl_expiresAt', expireAfterSeconds: 0 }]
    ],
    devices: [
        [{ tokenHash: 1 }, { name: 'tokenHash_unique', unique: true }],
        [{ systemId: 1 }, { name: 'systemId' }]
    ]
};

for (const [collectionName, indexes] of Object.entries(INDEXES)) {
    // Collections, die es noch nicht gibt, haben noch keine Indizes (createIndex legt sie an)
    let existingNames = [];
    try {
        existingNames = sortify[collectionName].getIndexes().map(i => i.name);
    } catch (e) {}
    for (const [key, options] of indexes) {
        const label = `${collectionName}.${options.name}`;
        if (existingNames.includes(options.name)) {
            print(`✔ ${label} existiert bereits`);
            continue;
        }
        try {
            sortify[collectionName].createIndex(key, options);
            print(`＋ ${label} angelegt`);
        } catch (e) {
            print(`❌ ${label} fehlgeschlagen: ${e.message}`);
        }
    }
}
print('Fertig.');
