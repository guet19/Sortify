// Inventur: Ein Regal Fach für Fach zählen (wiegen), am Ende die Abweichungen übernehmen.
// Collection stocktakes {
//   systemId, shelfId, shelfName, status: 'open' | 'done' | 'discarded',
//   startedAt, startedBy: { userId, userName }, finishedAt, finishedBy, applied,
//   items: [{ barcode, ledIndex, articleId, articleTitle, imagePath, price, boxWeight, itemWeight,
//             counted, expected, method: 'weighed' | 'manual', weight, skipped, countedAt, countedBy, applyError }]
// }
// Regeln (Umrechnung, Auswertung): $lib/stocktake.js
import { ObjectId } from 'mongodb';
import db from '$lib/server/db.js';
import { articleDrawers } from '$lib/barcodes.js';
import { countFromWeight, parseCount, isCounted, deviation, correctedStock, stocktakeSummary } from '$lib/stocktake.js';

const collection = async () => (await db.getDb()).collection('stocktakes');
const oid = (id) => (ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : null);
const by = (meta = {}) => ({ userId: oid(meta.userId), userName: meta.userName || '' });

function toPlain(s) {
    return {
        id: s._id.toString(),
        shelfId: s.shelfId?.toString() || null,
        shelfName: s.shelfName,
        status: s.status,
        startedAt: s.startedAt.toISOString(),
        startedBy: s.startedBy?.userName || '',
        finishedAt: s.finishedAt?.toISOString() || null,
        applied: !!s.applied,
        items: s.items.map((i) => ({
            barcode: i.barcode,
            ledIndex: i.ledIndex,
            articleId: i.articleId?.toString() || null,
            articleTitle: i.articleTitle,
            imagePath: i.imagePath || null,
            price: typeof i.price === 'number' ? i.price : null,
            boxWeight: typeof i.boxWeight === 'number' ? i.boxWeight : null,
            itemWeight: typeof i.itemWeight === 'number' ? i.itemWeight : null,
            counted: typeof i.counted === 'number' ? i.counted : null,
            expected: typeof i.expected === 'number' ? i.expected : null,
            method: i.method || null,
            weight: typeof i.weight === 'number' ? i.weight : null,
            skipped: !!i.skipped,
            countedAt: i.countedAt?.toISOString() || null,
            applyError: i.applyError || null
        }))
    };
}

const number = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// Neue Inventur für ein Regal – oder die bereits offene dieses Regals fortsetzen
export async function startStocktake(systemId, shelfId, meta = {}) {
    const stocktakes = await collection();
    const shelfOid = oid(shelfId);
    if (!shelfOid) return { error: 'Regal nicht gefunden.' };
    const open = await stocktakes.findOne({ systemId: oid(systemId), shelfId: shelfOid, status: 'open' }, { projection: { _id: 1 } });
    if (open) return { id: open._id.toString(), resumed: true };

    const database = await db.getDb();
    const shelf = await database.collection('shelves').findOne({ _id: shelfOid, systemId: oid(systemId) });
    if (!shelf) return { error: 'Regal nicht gefunden.' };
    const drawers = (shelf.drawers || []).filter((d) => d.barcode).sort((a, b) => (parseInt(a.ledIndex) || 0) - (parseInt(b.ledIndex) || 0));
    const barcodes = drawers.map((d) => d.barcode);
    const articles = await database.collection('articles').find(
        { systemId: oid(systemId), $or: [{ 'assigned_barcodes.barcode': { $in: barcodes } }, { assigned_barcodes: { $in: barcodes } }, { assigned_barcode: { $in: barcodes } }] },
        { projection: { title: 1, imagePath: 1, price: 1, attributes: 1, assigned_barcodes: 1, assigned_barcode: 1, istBestand: 1 } }
    ).toArray();

    // Nur Fächer, in denen ein Artikel liegt (leere Fächer haben nichts zu zählen)
    const items = [];
    for (const drawer of drawers) {
        const article = articles.find((a) => articleDrawers(a).some((d) => d.barcode === drawer.barcode));
        if (!article) continue;
        items.push({
            barcode: drawer.barcode,
            ledIndex: parseInt(drawer.ledIndex) || 0,
            articleId: article._id,
            articleTitle: article.title || '',
            imagePath: article.imagePath || null,
            price: number(article.price) > 0 ? number(article.price) : null,
            boxWeight: number(drawer.boxWeight),
            itemWeight: number(article.attributes?.itemWeight) > 0 ? number(article.attributes.itemWeight) : null,
            counted: null, expected: null, method: null, weight: null, skipped: false
        });
    }
    if (items.length === 0) return { error: `Im Regal „${shelf.name}“ liegen keine Artikel.` };

    const { insertedId } = await stocktakes.insertOne({
        systemId: oid(systemId), shelfId: shelfOid, shelfName: shelf.name || 'Regal',
        status: 'open', startedAt: new Date(), startedBy: by(meta), items
    });
    return { id: insertedId.toString(), resumed: false };
}

export async function getStocktake(systemId, id) {
    const row = oid(id) ? await (await collection()).findOne({ _id: oid(id), systemId: oid(systemId) }) : null;
    return row ? toPlain(row) : null;
}

// Offene Inventuren und die letzten abgeschlossenen (ohne Fachliste, nur Kennzahlen)
export async function listStocktakes(systemId, limit = 15) {
    const stocktakes = await collection();
    const [open, recent] = await Promise.all([
        stocktakes.find({ systemId: oid(systemId), status: 'open' }).sort({ startedAt: -1 }).toArray(),
        stocktakes.find({ systemId: oid(systemId), status: { $in: ['done', 'discarded'] } }).sort({ finishedAt: -1 }).limit(limit).toArray()
    ]);
    const brief = (s) => {
        const plain = toPlain(s);
        const { items, ...rest } = plain;
        const { deviations, ...summary } = stocktakeSummary(items);
        return { ...rest, ...summary, deviationCount: deviations.length };
    };
    return { open: open.map(brief), recent: recent.map(brief) };
}

// Bestand eines Fachs laut Sortify (für "erwartet")
async function drawerStock(systemId, articleId, barcode) {
    const article = await db.getArticleById(systemId, articleId.toString());
    const drawer = article ? articleDrawers(article).find((d) => d.barcode === barcode) : null;
    return drawer ? drawer.stock : null;
}

async function openStocktakeItem(systemId, id, barcode) {
    const stocktake = oid(id) ? await (await collection()).findOne({ _id: oid(id), systemId: oid(systemId), status: 'open' }) : null;
    if (!stocktake) return { error: 'Diese Inventur ist nicht mehr offen.' };
    const item = stocktake.items.find((i) => i.barcode === barcode);
    return item ? { stocktake, item } : { error: 'Dieses Fach gehört nicht zur Inventur.' };
}

// Ergebnis für ein Fach speichern: gewogen (weight) oder von Hand gezählt (counted)
export async function recordCount(systemId, id, barcode, { weight = null, counted = null } = {}, meta = {}) {
    const found = await openStocktakeItem(systemId, id, barcode);
    if (found.error) return found;
    const { item } = found;

    let value, method, measured = null;
    if (weight !== null && weight !== undefined && weight !== '') {
        measured = number(weight);
        value = measured === null ? null : countFromWeight(measured, item.boxWeight, item.itemWeight);
        if (value === null) return { error: 'Für dieses Fach fehlen Leer- oder Stückgewicht. Bitte von Hand zählen.' };
        method = 'weighed';
    } else {
        value = parseCount(counted);
        if (value === null) return { error: 'Bitte eine ganze Zahl ab 0 eingeben.' };
        method = 'manual';
    }

    const expected = await drawerStock(systemId, item.articleId, barcode);
    if (expected === null) return { error: 'Das Fach ist dem Artikel nicht mehr zugeordnet. Bitte überspringen.' };

    await (await collection()).updateOne(
        { _id: found.stocktake._id, status: 'open', 'items.barcode': barcode },
        { $set: {
            'items.$.counted': value, 'items.$.expected': expected, 'items.$.method': method, 'items.$.weight': measured,
            'items.$.skipped': false, 'items.$.countedAt': new Date(), 'items.$.countedBy': by(meta)
        } }
    );
    return { ok: true, counted: value, expected, diff: value - expected };
}

export async function skipItem(systemId, id, barcode) {
    const found = await openStocktakeItem(systemId, id, barcode);
    if (found.error) return found;
    await (await collection()).updateOne(
        { _id: found.stocktake._id, status: 'open', 'items.barcode': barcode },
        { $set: { 'items.$.skipped': true, 'items.$.counted': null, 'items.$.expected': null, 'items.$.method': null } }
    );
    return { ok: true };
}

// Abweichungen übernehmen: Fachbestand = gezählt + Bewegungen seit dem Zählen.
// Zuerst abschliessen (ein zweiter Klick bucht nicht doppelt), dann buchen.
export async function applyStocktake(systemId, id, meta = {}) {
    const stocktakes = await collection();
    const stocktake = await stocktakes.findOneAndUpdate(
        { _id: oid(id), systemId: oid(systemId), status: 'open' },
        { $set: { status: 'done', applied: true, finishedAt: new Date(), finishedBy: by(meta) } }
    );
    if (!stocktake) return { error: 'Diese Inventur ist bereits abgeschlossen.' };

    let booked = 0;
    const failed = [];
    for (const item of stocktake.items) {
        if (!isCounted(item) || deviation(item) === 0) continue;
        try {
            const current = await drawerStock(systemId, item.articleId, item.barcode);
            if (current === null) throw Object.assign(new Error('Fach nicht mehr zugeordnet'), { code: 'unknown_drawer' });
            await db.setDrawerStock(systemId, item.articleId.toString(), item.barcode, correctedStock(item, current), { ...meta, source: 'terminal-inventur' });
            booked++;
        } catch (err) {
            const reason = err.code === 'unknown_drawer' ? 'Fach ist dem Artikel nicht mehr zugeordnet' : 'Buchung fehlgeschlagen';
            if (err.code !== 'unknown_drawer') console.error('Inventur-Buchung fehlgeschlagen:', err);
            failed.push(item.barcode);
            await stocktakes.updateOne({ _id: stocktake._id, 'items.barcode': item.barcode }, { $set: { 'items.$.applyError': reason } });
        }
    }
    return { ok: true, booked, failed };
}

// Abschliessen ohne Buchung
export async function discardStocktake(systemId, id, meta = {}) {
    const result = await (await collection()).updateOne(
        { _id: oid(id), systemId: oid(systemId), status: 'open' },
        { $set: { status: 'discarded', applied: false, finishedAt: new Date(), finishedBy: by(meta) } }
    );
    return result.modifiedCount === 1;
}
