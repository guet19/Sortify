// Findet Bilder im Cloudinary-Ordner "storify_uploads", die kein Artikel mehr verwendet
// (z.B. abgebrochene Formulare oder Löschungen aus der Zeit vor dem automatischen Aufräumen).
//
//   node --env-file=.env scripts/cleanup-cloudinary.js          -> nur anzeigen (Trockenlauf)
//   node --env-file=.env scripts/cleanup-cloudinary.js --apply  -> wirklich löschen
//
// Bilder, die jünger als 24 Stunden sind, werden nie gelöscht (evtl. gerade im Formular in Arbeit).
// Benötigt DB_URI und CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET.

import { MongoClient } from 'mongodb';
import { v2 as cloudinary } from 'cloudinary';
import { cloudinaryPublicIdFor, UPLOAD_FOLDER } from '../src/lib/cloudinaryId.js';

const DB_NAME = 'Sortify_Prod';
const APPLY = process.argv.includes('--apply');
const MIN_AGE_MS = 24 * 60 * 60 * 1000;

const required = ['DB_URI', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
    console.error(`❌ Fehlende Umgebungsvariablen: ${missing.join(', ')}. Aufruf z.B.: node --env-file=.env scripts/cleanup-cloudinary.js`);
    process.exit(1);
}

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

async function usedPublicIds(db) {
    const used = new Set();
    const cursor = db.collection('articles').find({}, { projection: { images: 1, imagePath: 1 } });
    for await (const article of cursor) {
        for (const url of [...(article.images || []), article.imagePath]) {
            const id = url && cloudinaryPublicIdFor(url, process.env.CLOUDINARY_CLOUD_NAME);
            if (id) used.add(id);
        }
    }
    return used;
}

async function* uploadedImages() {
    let next_cursor;
    do {
        const page = await cloudinary.api.resources({ type: 'upload', resource_type: 'image', prefix: UPLOAD_FOLDER, max_results: 500, next_cursor });
        yield* page.resources;
        next_cursor = page.next_cursor;
    } while (next_cursor);
}

async function main() {
    const client = new MongoClient(process.env.DB_URI);
    await client.connect();
    try {
        const used = await usedPublicIds(client.db(DB_NAME));
        console.log(`In Artikeln verwendete Cloudinary-Bilder: ${used.size}`);

        const orphans = [];
        let total = 0, tooNew = 0;
        for await (const res of uploadedImages()) {
            total++;
            if (used.has(res.public_id)) continue;
            if (Date.now() - new Date(res.created_at).getTime() < MIN_AGE_MS) { tooNew++; continue; }
            orphans.push(res);
        }

        const mb = (orphans.reduce((s, r) => s + (r.bytes || 0), 0) / 1024 / 1024).toFixed(1);
        console.log(`Bilder im Ordner ${UPLOAD_FOLDER}: ${total}, davon jünger als 24 h: ${tooNew}`);
        console.log(`Nicht mehr verwendet: ${orphans.length} (${mb} MB)`);
        for (const r of orphans.slice(0, 20)) console.log(`  – ${r.public_id}  (${r.created_at.slice(0, 10)})`);
        if (orphans.length > 20) console.log(`  … und ${orphans.length - 20} weitere`);

        if (!APPLY) {
            console.log('\nTrockenlauf – nichts gelöscht. Zum Löschen mit --apply erneut ausführen.');
            return;
        }
        let deleted = 0;
        for (let i = 0; i < orphans.length; i += 100) {
            const ids = orphans.slice(i, i + 100).map((r) => r.public_id);
            const result = await cloudinary.api.delete_resources(ids, { resource_type: 'image', type: 'upload' });
            deleted += Object.values(result.deleted || {}).filter((v) => v === 'deleted').length;
        }
        console.log(`\n🗑️  ${deleted} Bilder bei Cloudinary gelöscht.`);
    } finally {
        await client.close();
    }
}

main().catch((error) => {
    console.error(error?.error?.message || error);
    process.exit(1);
});
