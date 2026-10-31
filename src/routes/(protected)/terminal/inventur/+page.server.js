import { fail, redirect } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import db from '$lib/server/db.js';
import { actor } from '$lib/server/actor.js';
import { listTerminals } from '$lib/server/devices.js';
import { listStocktakes, startStocktake } from '$lib/server/stocktakes.js';
import { shelfTerminalId } from '$lib/terminals.js';

// Inventur: Regal wählen, offene Inventur fortsetzen, letzte Inventuren ansehen
export async function load({ locals }) {
    const systemId = locals.systemId;
    const database = await db.getDb();
    const filter = { systemId: new ObjectId(systemId) };
    const [shelves, terminals, stocktakes, entries, legacy] = await Promise.all([
        db.getShelves(systemId),
        listTerminals(systemId),
        listStocktakes(systemId),
        // Belegte Fächer (alte und neue Datenformate), ohne alle Artikel zu laden
        database.collection('articles').distinct('assigned_barcodes', filter),
        database.collection('articles').distinct('assigned_barcode', filter)
    ]);
    const used = new Set([...entries, ...legacy].map((b) => (b && typeof b === 'object' ? b.barcode : b)).filter(Boolean));

    return {
        shelves: shelves.map((s) => ({
            id: s._id,
            name: s.name,
            drawers: (s.drawers || []).filter((d) => d.barcode && used.has(d.barcode)).length,
            terminal: terminals.length > 1 ? terminals.find((t) => t.id === shelfTerminalId(s, terminals))?.name || null : null,
            open: stocktakes.open.find((o) => o.shelfId === s._id) || null
        })),
        recent: stocktakes.recent
    };
}

export const actions = {
    start: async ({ request, locals }) => {
        const data = await request.formData();
        const result = await startStocktake(locals.systemId, data.get('shelfId')?.toString(), actor(locals, 'terminal-inventur'));
        if (result.error) return fail(400, { error: result.error });
        throw redirect(303, `/terminal/inventur/${result.id}`);
    }
};
