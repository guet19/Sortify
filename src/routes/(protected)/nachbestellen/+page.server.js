import { error } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { buildReorderList } from '$lib/reorder.js';

export async function load({ locals }) {
    if (!locals.systemId) throw error(401, 'Kein aktives Lager ausgewählt');

    const [articles, system] = await Promise.all([
        db.getArticles(locals.systemId),
        db.getSystemById(locals.systemId)
    ]);

    return {
        groups: buildReorderList(articles),
        systemName: system?.name || 'Lager'
    };
}
