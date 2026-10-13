// Vereinheitlicht alte Barcode-Formate der Artikel auf assigned_barcodes: [{ barcode, stock, … }]
// (altes Feld assigned_barcode und reine String-Listen). Der Gesamtbestand bleibt unverändert.
//
//   node --env-file=.env scripts/migrate-barcodes.js          -> nur anzeigen (Trockenlauf)
//   node --env-file=.env scripts/migrate-barcodes.js --apply  -> umstellen
//
// Benötigt DB_URI. Vorher am besten ein Backup machen: node --env-file=.env scripts/backup-db.js

import { MongoClient } from 'mongodb';
import { normalizeArticleBarcodes } from '../src/lib/barcodes.js';

const DB_NAME = 'Sortify_Prod';
const APPLY = process.argv.includes('--apply');

async function main() {
    if (!process.env.DB_URI) {
        console.error('❌ DB_URI fehlt. Aufruf z.B.: node --env-file=.env scripts/migrate-barcodes.js');
        process.exit(1);
    }
    const client = new MongoClient(process.env.DB_URI);
    await client.connect();
    try {
        const articles = client.db(DB_NAME).collection('articles');
        const cursor = articles.find(
            { $or: [{ assigned_barcode: { $exists: true } }, { assigned_barcodes: { $elemMatch: { $type: 'string' } } }] },
            { projection: { title: 1, istBestand: 1, assigned_barcode: 1, assigned_barcodes: 1 } }
        );

        let count = 0;
        for await (const article of cursor) {
            const barcodes = normalizeArticleBarcodes(article);
            if (!barcodes) continue;
            count++;
            console.log(`• ${article.title} (${article._id}): ${JSON.stringify(article.assigned_barcode ?? null)} / ${JSON.stringify(article.assigned_barcodes ?? [])}  →  ${barcodes.map((b) => `${b.barcode}:${b.stock}`).join(', ') || '(keine)'}`);
            if (APPLY) {
                await articles.updateOne({ _id: article._id }, { $set: { assigned_barcodes: barcodes }, $unset: { assigned_barcode: '' } });
            }
        }

        if (count === 0) console.log('✔ Alle Artikel nutzen bereits das aktuelle Format.');
        else console.log(APPLY ? `\n✔ ${count} Artikel umgestellt.` : `\nTrockenlauf – ${count} Artikel würden umgestellt. Mit --apply ausführen.`);
    } finally {
        await client.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
