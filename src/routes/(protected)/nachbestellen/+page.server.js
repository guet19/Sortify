import { error, fail } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { actor } from '$lib/server/actor.js';
import { buildReorderList } from '$lib/reorder.js';
import { openOrderQuantities, listOpenOrders, listRecentOrders, createOrders, receiveOrder, cancelOrder, rescheduleOrder } from '$lib/server/orders.js';

export async function load({ locals }) {
    if (!locals.systemId) throw error(401, 'Kein aktives Lager ausgewählt');

    const [articles, system, onOrder, openOrders, recentOrders] = await Promise.all([
        db.getArticles(locals.systemId),
        db.getSystemById(locals.systemId),
        openOrderQuantities(locals.systemId),
        listOpenOrders(locals.systemId),
        listRecentOrders(locals.systemId)
    ]);

    return {
        groups: buildReorderList(articles, onOrder),
        openOrders,
        recentOrders,
        systemName: system?.name || 'Lager'
    };
}

export const actions = {
    // Artikel als bestellt markieren: ein einzelner (articleId) oder alle eines Lieferanten (articleId = 'all')
    order: async ({ request, locals }) => {
        const data = await request.formData();
        const which = data.get('articleId')?.toString();
        const items = [];
        for (const [key, value] of data.entries()) {
            if (!key.startsWith('qty:')) continue;
            const articleId = key.slice(4);
            if (which === 'all' || which === articleId) items.push({ articleId, quantity: value.toString() });
        }
        const result = await createOrders(locals.systemId, items, data.get('expectedDate')?.toString() || '', actor(locals, 'web'));
        if (result.error) return fail(400, { orderError: result.error });
        return { ordered: result.created };
    },

    // Lieferung ist da: Menge einlagern, Bestand wird automatisch erhöht
    receive: async ({ request, locals }) => {
        const data = await request.formData();
        try {
            const result = await receiveOrder(locals.systemId, data.get('orderId')?.toString(), {
                quantity: data.get('quantity')?.toString(),
                barcode: data.get('barcode')?.toString() || ''
            }, actor(locals, 'wareneingang'));
            if (result.error) return fail(400, { receiveError: result.error, orderId: data.get('orderId')?.toString() });
            return { received: result };
        } catch (err) {
            console.error('Wareneingang fehlgeschlagen:', err);
            return fail(500, { receiveError: 'Der Bestand konnte nicht gespeichert werden. Bitte erneut versuchen.', orderId: data.get('orderId')?.toString() });
        }
    },

    cancel: async ({ request, locals }) => {
        const data = await request.formData();
        const ok = await cancelOrder(locals.systemId, data.get('orderId')?.toString(), actor(locals, 'web'));
        return ok ? { cancelled: true } : fail(400, { receiveError: 'Diese Bestellung ist nicht mehr offen. Bitte die Seite neu laden.' });
    },

    reschedule: async ({ request, locals }) => {
        const data = await request.formData();
        const result = await rescheduleOrder(locals.systemId, data.get('orderId')?.toString(), data.get('expectedDate')?.toString() || '');
        return result.error ? fail(400, { receiveError: result.error, orderId: data.get('orderId')?.toString() }) : { rescheduled: true };
    }
};
