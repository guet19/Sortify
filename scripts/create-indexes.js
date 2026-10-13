// Legt alle Indizes und automatischen Löschfristen (TTL) für Sortify an.
// Einmalig ausführen (und erneut, wenn hier etwas dazukommt – bestehende Indizes werden übersprungen):
//
//   node --env-file=.env scripts/create-indexes.js            -> anlegen
//   node --env-file=.env scripts/create-indexes.js --dry-run  -> nur anzeigen, was angelegt würde
//
// Benötigt die Umgebungsvariable DB_URI (wie die App selbst).

import { MongoClient } from 'mongodb';

const DB_NAME = 'Sortify_Prod';
const DRY_RUN = process.argv.includes('--dry-run');

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

// Nur Dokumente mit echtem String-Wert indexieren (lokale Nutzer haben email: null)
const onlyStrings = (field) => ({ partialFilterExpression: { [field]: { $type: 'string' } } });

const INDEXES = {
    users: [
        // Eindeutigkeit (nur echte Werte) und Suche sind getrennte Indizes,
        // da Abfragen wie { email: 'x' } einen gefilterten Index nicht zuverlässig nutzen
        { key: { email: 1 }, options: { name: 'email_unique', unique: true, ...onlyStrings('email') } },
        { key: { email: 1, _id: 1 }, options: { name: 'email_lookup' } },
        { key: { username: 1 }, options: { name: 'username_unique', unique: true, ...onlyStrings('username') } },
        { key: { username: 1, _id: 1 }, options: { name: 'username_lookup' } },
        { key: { 'systems.systemId': 1 }, options: { name: 'systems_systemId' } },
        { key: { resetToken: 1 }, options: { name: 'resetToken', sparse: true } },
        { key: { verificationToken: 1 }, options: { name: 'verificationToken', sparse: true } },
        { key: { emailChangeToken: 1 }, options: { name: 'emailChangeToken', sparse: true } },
        { key: { passwordChangeToken: 1 }, options: { name: 'passwordChangeToken', sparse: true } }
    ],
    sessions: [
        { key: { tokenHash: 1 }, options: { name: 'tokenHash_unique', unique: true } },
        { key: { userId: 1 }, options: { name: 'userId' } },
        // Abgelaufene Sessions löscht MongoDB automatisch
        { key: { expiresAt: 1 }, options: { name: 'ttl_expiresAt', expireAfterSeconds: 0 } }
    ],
    rate_limits: [
        { key: { key: 1 }, options: { name: 'key_unique', unique: true } },
        { key: { expiresAt: 1 }, options: { name: 'ttl_expiresAt', expireAfterSeconds: 0 } }
    ],
    loginAttempts: [
        { key: { ip: 1 }, options: { name: 'ip' } },
        // Bestehender Index in der Datenbank: nach 3 Tagen löschen
        { key: { createdAt: 1 }, options: { name: 'createdAt_1', expireAfterSeconds: 3 * DAY } }
    ],
    sessionLogs: [
        { key: { sessionId: 1 }, options: { name: 'sessionId' } },
        // Anmelde-Protokolle nach 180 Tagen löschen
        { key: { createdAt: 1 }, options: { name: 'createdAt_1', expireAfterSeconds: 180 * DAY } }
    ],
    systems: [
        { key: { createdBy: 1 }, options: { name: 'createdBy' } }
    ],
    articles: [
        { key: { systemId: 1, createdAt: -1 }, options: { name: 'systemId_createdAt' } },
        { key: { systemId: 1, 'assigned_barcodes.barcode': 1 }, options: { name: 'systemId_barcode' } },
        // Prüfung, ob ein Bild noch verwendet wird (vor dem Löschen bei Cloudinary)
        { key: { images: 1 }, options: { name: 'images' } },
        { key: { imagePath: 1 }, options: { name: 'imagePath' } }
    ],
    shelves: [
        { key: { systemId: 1, start_index: 1 }, options: { name: 'systemId_startIndex' } },
        { key: { systemId: 1, 'drawers.barcode': 1 }, options: { name: 'systemId_drawerBarcode' } }
    ],
    categories: [
        { key: { systemId: 1 }, options: { name: 'systemId' } }
    ],
    filter_attributes: [
        { key: { systemId: 1 }, options: { name: 'systemId' } }
    ],
    stock_movements: [
        { key: { systemId: 1, articleId: 1, createdAt: -1 }, options: { name: 'systemId_article_createdAt' } },
        { key: { systemId: 1, createdAt: -1 }, options: { name: 'systemId_createdAt' } },
        // Bewegungsprotokoll nach 2 Jahren löschen
        { key: { createdAt: 1 }, options: { name: 'ttl_createdAt', expireAfterSeconds: 730 * DAY } }
    ],
    hardware_commands: [
        { key: { systemId: 1, status: 1 }, options: { name: 'systemId_status' } },
        // Erledigte/alte LED-Befehle nach 24 Stunden entfernen
        { key: { createdAt: 1 }, options: { name: 'ttl_createdAt', expireAfterSeconds: DAY } }
    ],
    scale_requests: [
        { key: { systemId: 1, status: 1 }, options: { name: 'systemId_status' } },
        // Wiege-Aufträge werden nur wenige Sekunden gebraucht
        { key: { createdAt: 1 }, options: { name: 'ttl_createdAt', expireAfterSeconds: HOUR } }
    ],
    device_pairings: [
        { key: { systemId: 1, status: 1 }, options: { name: 'systemId_status' } },
        { key: { code1: 1, status: 1 }, options: { name: 'code1_status' } }
    ]
};

async function main() {
    if (!process.env.DB_URI) {
        console.error('❌ DB_URI fehlt. Aufruf z.B.: node --env-file=.env scripts/create-indexes.js');
        process.exit(1);
    }

    const client = new MongoClient(process.env.DB_URI);
    await client.connect();
    const db = client.db(DB_NAME);
    let failed = 0;

    try {
        for (const [collectionName, indexes] of Object.entries(INDEXES)) {
            const collection = db.collection(collectionName);
            const existing = await collection.indexes().catch(() => []);
            const existingNames = new Set(existing.map(i => i.name));

            for (const { key, options } of indexes) {
                const label = `${collectionName}.${options.name}`;
                if (existingNames.has(options.name)) {
                    console.log(`✔ ${label} existiert bereits`);
                    continue;
                }
                if (DRY_RUN) {
                    console.log(`… ${label} würde angelegt`, JSON.stringify(key), options.expireAfterSeconds !== undefined ? `(TTL ${options.expireAfterSeconds}s)` : '');
                    continue;
                }
                try {
                    await collection.createIndex(key, options);
                    console.log(`＋ ${label} angelegt`);
                } catch (error) {
                    // z.B. doppelte E-Mail-Adressen verhindern einen Unique-Index -> melden, weitermachen
                    failed++;
                    console.error(`❌ ${label} fehlgeschlagen: ${error.message}`);
                }
            }
        }
    } finally {
        await client.close();
    }

    if (failed > 0) {
        console.error(`\n${failed} Index(e) konnten nicht angelegt werden – siehe Meldungen oben.`);
        process.exit(1);
    }
    console.log(DRY_RUN ? '\nTrockenlauf beendet, nichts geändert.' : '\nFertig.');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
