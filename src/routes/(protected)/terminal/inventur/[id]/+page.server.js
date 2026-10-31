import { error, fail } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { actor } from '$lib/server/actor.js';
import { scaleTarget } from '$lib/server/devices.js';
import { getStocktake, recordCount, skipItem, applyStocktake, discardStocktake } from '$lib/server/stocktakes.js';

export async function load({ params, locals }) {
    const stocktake = await getStocktake(locals.systemId, params.id);
    if (!stocktake) throw error(404, 'Diese Inventur gibt es nicht (mehr).');
    return { stocktake };
}

const field = (data, name) => data.get(name)?.toString() || '';

export const actions = {
    // Das aktuelle Fach leuchtet (am Terminal seines Regals), das vorherige geht aus
    focus: async ({ request, locals }) => {
        const data = await request.formData();
        const barcode = field(data, 'barcode'), previous = field(data, 'previous');
        try {
            if (previous && previous !== barcode) await db.triggerLedsByBarcodeArray(locals.systemId, [previous], '#000000');
            if (barcode) await db.triggerLedsByBarcodeArray(locals.systemId, [barcode], locals.color || '#3b82f6');
        } catch (err) {
            console.error('Inventur: LED konnte nicht geschaltet werden:', err);
        }
        return { focused: barcode };
    },

    ledsOff: async ({ request, locals }) => {
        const barcode = field(await request.formData(), 'barcode');
        if (barcode) await db.triggerLedsByBarcodeArray(locals.systemId, [barcode], '#000000').catch(() => {});
        return { ok: true };
    },

    // Wiege-Auftrag an die Waage des Terminals, an dem dieser Browser steht; das Ergebnis holt der Browser über /api/scale/[id]
    weigh: async ({ request, locals, cookies }) => {
        const barcode = field(await request.formData(), 'barcode');
        const target = await scaleTarget(locals.systemId, cookies, { barcode });
        if (target.error) return fail(409, { error: target.error });
        // Kurz warten, bis die Kiste ruhig auf der Waage steht (wie bei der Rückgabe)
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const requestId = await db.createScaleRequest(locals.systemId, barcode, { deviceId: target.deviceId });
        return { requestId };
    },

    count: async ({ request, params, locals }) => {
        const data = await request.formData();
        const result = await recordCount(locals.systemId, params.id, field(data, 'barcode'), {
            weight: data.get('weight')?.toString() ?? null,
            counted: data.get('counted')?.toString() ?? null
        }, actor(locals, 'terminal-inventur'));
        return result.error ? fail(400, { error: result.error }) : { result };
    },

    skip: async ({ request, params, locals }) => {
        const result = await skipItem(locals.systemId, params.id, field(await request.formData(), 'barcode'));
        return result.error ? fail(400, { error: result.error }) : { skipped: true };
    },

    // Abweichungen als Bestandskorrektur buchen
    apply: async ({ params, locals }) => {
        const result = await applyStocktake(locals.systemId, params.id, actor(locals, 'terminal-inventur'));
        return result.error ? fail(400, { error: result.error }) : { applied: result };
    },

    discard: async ({ params, locals }) => {
        const ok = await discardStocktake(locals.systemId, params.id, actor(locals, 'terminal-inventur'));
        return ok ? { discarded: true } : fail(400, { error: 'Diese Inventur ist bereits abgeschlossen.' });
    }
};
