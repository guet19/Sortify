// Bestellungen: Artikel aus der Nachbestell-Liste als „bestellt“ markieren und bei Ankunft einlagern.
// Collection orders {
//   systemId, articleId, articleTitle, supplier, quantity, received, unitPrice,
//   status: 'open' | 'received' | 'cancelled', expectedDate: 'YYYY-MM-DD' | null,
//   orderedAt, orderedBy: { userId, userName }, receipts: [{ quantity, barcode, at, userId, userName }],
//   closedAt, cancelReason
// }
// Offene Bestellungen zählen als Bestand unterwegs, damit nichts doppelt bestellt wird ($lib/reorder.js).
import { ObjectId } from 'mongodb';
import db from '$lib/server/db.js';
import { articleDrawers, findDrawer } from '$lib/barcodes.js';
import { parseQuantity, parseDate, remainingQuantity } from '$lib/orders.js';

const collection = async () => (await db.getDb()).collection('orders');
const oid = (id) => (ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : null);
const by = (meta = {}) => ({ userId: oid(meta.userId), userName: meta.userName || '' });

function toPlain(o) {
    return {
        id: o._id.toString(),
        articleId: o.articleId.toString(),
        title: o.articleTitle,
        supplier: o.supplier || 'Ohne Lieferant',
        quantity: o.quantity,
        received: o.received || 0,
        remaining: remainingQuantity(o),
        unitPrice: typeof o.unitPrice === 'number' ? o.unitPrice : null,
        status: o.status,
        expectedDate: o.expectedDate || null,
        orderedAt: o.orderedAt.toISOString(),
        orderedBy: o.orderedBy?.userName || '',
        closedAt: o.closedAt?.toISOString() || null,
        cancelReason: o.cancelReason || null
    };
}

// { articleId: noch offene Menge } – für die Nachbestell-Liste, die Startseite und den Mail-Hinweis
export async function openOrderQuantities(systemId) {
    const rows = await (await collection()).aggregate([
        { $match: { systemId: oid(systemId), status: 'open' } },
        { $group: { _id: '$articleId', open: { $sum: { $max: [{ $subtract: ['$quantity', { $ifNull: ['$received', 0] }] }, 0] } } } }
    ]).toArray();
    return Object.fromEntries(rows.map((r) => [r._id.toString(), r.open]));
}

// Offene Bestellungen mit dem aktuellen Stand des Artikels (Fächer fürs Einlagern)
export async function listOpenOrders(systemId) {
    const orders = await (await collection())
        .find({ systemId: oid(systemId), status: 'open' })
        .sort({ expectedDate: 1, orderedAt: 1 })
        .toArray();
    if (orders.length === 0) return [];

    const ids = [...new Set(orders.map((o) => o.articleId.toString()))].map((id) => new ObjectId(id));
    const articles = await (await db.getDb()).collection('articles')
        .find({ _id: { $in: ids }, systemId: oid(systemId) }, { projection: { title: 1, imagePath: 1, istBestand: 1, assigned_barcodes: 1, assigned_barcode: 1 } })
        .toArray();
    const byId = new Map(articles.map((a) => [a._id.toString(), a]));

    return orders
        .map((o) => {
            const article = byId.get(o.articleId.toString());
            return {
                ...toPlain(o),
                title: article?.title || o.articleTitle,
                imagePath: article?.imagePath || null,
                articleExists: !!article,
                stock: article ? parseFloat(article.istBestand) || 0 : 0,
                drawers: article ? articleDrawers(article).map((d) => ({ barcode: d.barcode, stock: d.stock })) : []
            };
        })
        // ohne Termin ans Ende
        .sort((a, b) => (!a.expectedDate) - (!b.expectedDate) || (a.expectedDate || '').localeCompare(b.expectedDate || ''));
}

// Zuletzt abgeschlossene Bestellungen (eingelagert oder storniert)
export async function listRecentOrders(systemId, limit = 15) {
    const rows = await (await collection())
        .find({ systemId: oid(systemId), status: { $in: ['received', 'cancelled'] } })
        .sort({ closedAt: -1 })
        .limit(limit)
        .toArray();
    return rows.map(toPlain);
}

// Offene Bestellungen eines Artikels (Hinweis auf der Artikelseite)
export async function openOrdersForArticle(systemId, articleId) {
    const id = oid(articleId);
    if (!id) return [];
    const rows = await (await collection()).find({ systemId: oid(systemId), articleId: id, status: 'open' }).sort({ orderedAt: 1 }).toArray();
    return rows.map(toPlain);
}

// items: [{ articleId, quantity }] – alle mit demselben Liefertermin (eine Bestellung pro Lieferant)
export async function createOrders(systemId, items, expectedDate, meta = {}) {
    const date = expectedDate ? parseDate(expectedDate) : null;
    if (expectedDate && !date) return { error: 'Bitte einen gültigen Liefertermin wählen.' };

    const wanted = [];
    for (const item of items) {
        const quantity = parseQuantity(item.quantity);
        const articleId = oid(item.articleId);
        if (!articleId) continue;
        if (!quantity) return { error: 'Bitte für jeden Artikel eine Menge von mindestens 1 Stück eingeben.' };
        wanted.push({ articleId, quantity });
    }
    if (wanted.length === 0) return { error: 'Kein Artikel ausgewählt.' };

    const database = await db.getDb();
    const articles = await database.collection('articles')
        .find({ _id: { $in: wanted.map((w) => w.articleId) }, systemId: oid(systemId) }, { projection: { title: 1, supplier: 1, price: 1 } })
        .toArray();
    const byId = new Map(articles.map((a) => [a._id.toString(), a]));

    const orders = await collection();
    // Doppelklick abfangen: dieselbe Bestellung innerhalb weniger Sekunden nicht zweimal anlegen
    const recent = await orders.find({
        systemId: oid(systemId), status: 'open', articleId: { $in: wanted.map((w) => w.articleId) },
        orderedAt: { $gte: new Date(Date.now() - 10000) }
    }, { projection: { articleId: 1, quantity: 1 } }).toArray();
    const isRepeat = (w) => recent.some((r) => r.articleId.equals(w.articleId) && r.quantity === w.quantity);

    const now = new Date();
    const docs = wanted
        .filter((w) => byId.has(w.articleId.toString()) && !isRepeat(w))
        .map((w) => {
            const article = byId.get(w.articleId.toString());
            const price = parseFloat(article.price);
            return {
                systemId: oid(systemId),
                articleId: w.articleId,
                articleTitle: article.title || '',
                supplier: String(article.supplier || '').trim() || 'Ohne Lieferant',
                quantity: w.quantity,
                received: 0,
                unitPrice: Number.isFinite(price) && price > 0 ? price : null,
                status: 'open',
                expectedDate: date,
                orderedAt: now,
                orderedBy: by(meta),
                receipts: []
            };
        });
    if (docs.length > 0) await orders.insertMany(docs);
    return { created: docs.length };
}

// Ware ist angekommen: Menge einlagern und den Bestand automatisch erhöhen.
// Ziel: das einzige Fach, bei mehreren Fächern das gewählte, sonst der Gesamtbestand (nicht eingelagert).
// Eine Teillieferung lässt die Bestellung mit der Restmenge offen.
export async function receiveOrder(systemId, orderId, { quantity, barcode = '' }, meta = {}) {
    const orders = await collection();
    const order = await orders.findOne({ _id: oid(orderId), systemId: oid(systemId), status: 'open' });
    if (!order) return { error: 'Diese Bestellung ist nicht mehr offen. Bitte die Seite neu laden.' };
    const qty = parseQuantity(quantity);
    if (!qty) return { error: 'Bitte die gelieferte Menge eingeben (mindestens 1 Stück).' };

    const article = await db.getArticleById(systemId, order.articleId.toString());
    if (!article) return { error: `„${order.articleTitle}“ existiert nicht mehr. Die Bestellung kann nur storniert werden.` };

    const drawers = articleDrawers(article);
    let drawer = null;
    if (drawers.length === 1) {
        drawer = drawers[0];
    } else if (drawers.length > 1) {
        drawer = findDrawer(drawers, barcode);
        if (!drawer) return { error: `Bitte wählen, in welches Fach „${article.title}“ eingelagert wird.` };
    }

    // Zuerst die Bestellung verbuchen (ein Doppelklick lagert so nicht zweimal ein), danach den Bestand
    const before = order.received || 0;
    const received = before + qty;
    const done = received >= order.quantity;
    const receipt = { quantity: qty, barcode: drawer?.barcode || null, at: new Date(), ...by(meta) };
    const claimed = await orders.findOneAndUpdate(
        { _id: order._id, status: 'open', received: before },
        { $set: { received, status: done ? 'received' : 'open', ...(done ? { closedAt: receipt.at } : {}) }, $push: { receipts: receipt } }
    );
    if (!claimed) return { error: 'Die Bestellung wurde gerade bearbeitet. Bitte die Seite neu laden.' };

    try {
        const stockMeta = { ...meta, source: 'wareneingang' };
        if (drawer) {
            await db.setDrawerStock(systemId, article._id, drawer.barcode, drawer.stock + qty, stockMeta);
        } else {
            await db.updateArticle(systemId, article._id, { istBestand: (parseFloat(article.istBestand) || 0) + qty }, stockMeta);
        }
    } catch (err) {
        // Bestand wurde nicht geändert -> Bestellung wieder auf den alten Stand
        await orders.updateOne(
            { _id: order._id },
            { $set: { received: before, status: 'open' }, $unset: { closedAt: '' }, $pull: { receipts: { at: receipt.at } } }
        );
        throw err;
    }
    return { ok: true, done, title: article.title, quantity: qty, barcode: drawer?.barcode || null, remaining: Math.max(order.quantity - received, 0) };
}

// Bestellung (bzw. die noch offene Restmenge) stornieren
export async function cancelOrder(systemId, orderId, meta = {}, reason = null) {
    const result = await (await collection()).updateOne(
        { _id: oid(orderId), systemId: oid(systemId), status: 'open' },
        { $set: { status: 'cancelled', closedAt: new Date(), cancelledBy: by(meta), ...(reason ? { cancelReason: reason } : {}) } }
    );
    return result.modifiedCount === 1;
}

export async function rescheduleOrder(systemId, orderId, expectedDate) {
    const date = expectedDate ? parseDate(expectedDate) : null;
    if (expectedDate && !date) return { error: 'Bitte einen gültigen Liefertermin wählen.' };
    const result = await (await collection()).updateOne(
        { _id: oid(orderId), systemId: oid(systemId), status: 'open' },
        { $set: { expectedDate: date } }
    );
    return result.matchedCount === 1 ? { ok: true } : { error: 'Diese Bestellung ist nicht mehr offen.' };
}
