import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';

// Gibt es die GTIN im aktiven Lager schon? ?gtin=…&exclude=<artikelId> (beim Bearbeiten den eigenen Artikel ausnehmen)
export async function GET({ url, locals }) {
    if (!locals.systemId) return json({ matches: [] }, { status: 401 });
    const gtin = url.searchParams.get('gtin') || '';
    const matches = await db.findArticlesByGtin(locals.systemId, gtin, url.searchParams.get('exclude'));
    return json({ matches }, { headers: { 'cache-control': 'no-store' } });
}
