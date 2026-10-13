// Sichert die Sortify-Datenbank als Extended JSON (eine Datei pro Collection, ein Dokument pro Zeile)
// in den Ordner backups/<Datum_Uhrzeit>/ – dieser Ordner ist von Git ausgeschlossen.
//
//   node --env-file=.env scripts/backup-db.js         -> Backup (ohne kurzlebige Daten wie Sessions)
//   node --env-file=.env scripts/backup-db.js --all   -> wirklich alle Collections
//
// Zurückspielen einer Collection (z.B. in eine Test-Datenbank):
//   mongoimport --uri "<DB_URI>" --db Sortify_Test --collection articles --file backups/<…>/articles.json
//
// Achtung: Das Backup enthält persönliche Daten und Passwort-Hashes – sicher aufbewahren.

import { MongoClient, BSON } from 'mongodb';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';

const DB_NAME = 'Sortify_Prod';
const ALL = process.argv.includes('--all');
// Kurzlebige oder jederzeit neu entstehende Daten
const SKIP = new Set(['sessions', 'rate_limits', 'loginAttempts', 'hardware_commands', 'scale_requests', 'ai_model_status']);

async function main() {
    if (!process.env.DB_URI) {
        console.error('❌ DB_URI fehlt. Aufruf z.B.: node --env-file=.env scripts/backup-db.js');
        process.exit(1);
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, (c) => (c === 'T' ? '_' : '-'));
    const dir = path.join('backups', stamp);
    await mkdir(dir, { recursive: true, mode: 0o700 });

    const client = new MongoClient(process.env.DB_URI);
    await client.connect();
    try {
        const db = client.db(DB_NAME);
        const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
            .map((c) => c.name)
            .filter((name) => !name.startsWith('system.') && (ALL || !SKIP.has(name)))
            .sort();

        for (const name of collections) {
            const file = path.join(dir, `${name}.json`);
            const out = createWriteStream(file, { mode: 0o600 });
            let count = 0;
            for await (const doc of db.collection(name).find({})) {
                // canonical = Typen wie ObjectId und Datum bleiben beim Zurückspielen erhalten
                if (!out.write(BSON.EJSON.stringify(doc, { relaxed: false }) + '\n')) await once(out, 'drain');
                count++;
            }
            out.end();
            await once(out, 'finish');
            console.log(`✔ ${name}: ${count} Dokumente`);
        }
        console.log(`\nBackup gespeichert in ${dir}${ALL ? '' : ` (übersprungen: ${[...SKIP].join(', ')})`}`);
    } finally {
        await client.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
