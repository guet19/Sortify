import { json } from '@sveltejs/kit';
import crypto from 'crypto';
import { env } from '$env/dynamic/private';
import db from '$lib/server/db.js';
import { buildReorderList } from '$lib/reorder.js';
import { sendLowStockEmail } from '$lib/server/email.js';
import { openOrderQuantities } from '$lib/server/orders.js';

// Täglicher Mindestbestand-Hinweis. Wird von der Netlify Scheduled Function netlify/functions/low-stock.mjs mit
// "Authorization: Bearer <CRON_SECRET>" aufgerufen – nicht für Nutzer gedacht.
function authorized(request) {
    const expected = env.CRON_SECRET;
    const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!expected || expected.length < 16 || given.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export async function POST({ request }) {
    if (!env.CRON_SECRET) return json({ error: 'CRON_SECRET ist nicht gesetzt.' }, { status: 503 });
    if (!authorized(request)) return json({ error: 'Nicht autorisiert.' }, { status: 401 });

    const report = [];
    for (const system of await db.listAllSystems()) {
        try {
            // Bereits bestellte Artikel lösen keine Mail aus
            const [articles, onOrder] = await Promise.all([db.getArticles(system._id), openOrderQuantities(system._id)]);
            const groups = buildReorderList(articles, onOrder);
            const lowIds = groups.flatMap(g => g.items.map(i => i.id));
            const newIds = lowIds.filter(id => !system.lowStockNotified.includes(id));

            // Nur mailen, wenn NEUE Artikel unter den Mindestbestand gefallen sind
            if (newIds.length > 0) {
                const recipients = await db.getSystemAdminEmails(system._id);
                if (recipients.length > 0) await sendLowStockEmail(recipients, system.name, groups, newIds.length);
                report.push({ system: system.name, low: lowIds.length, new: newIds.length, mailed: recipients.length });
            }
            // Wieder aufgefüllte Artikel fallen aus der Liste -> fallen sie erneut, gibt es wieder eine Mail
            await db.setLowStockNotified(system._id, lowIds);
        } catch (err) {
            console.error(`Mindestbestand-Prüfung für Lager ${system._id} fehlgeschlagen:`, err);
            report.push({ system: system.name, error: true });
        }
    }
    return json({ ok: true, report });
}
