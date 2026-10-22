import { error, fail } from '@sveltejs/kit';
import { getSystemFeatures, setSystemFeature, SYSTEM_FEATURES } from '$lib/server/projects.js';

// Zuschaltbare Funktionen des aktiven Lagers (z.B. Projekte & Kosten)
export async function load({ locals }) {
    if (!locals.systemId) throw error(401, 'Kein aktives Lager ausgewählt');
    return { features: await getSystemFeatures(locals.systemId) };
}

export const actions = {
    toggle: async ({ request, locals }) => {
        if (!locals.systemId) return fail(401, { error: 'Kein aktives Lager ausgewählt.' });
        const data = await request.formData();
        const feature = data.get('feature')?.toString();
        if (!SYSTEM_FEATURES.includes(feature)) return fail(400, { error: 'Unbekannte Funktion.' });
        const enabled = data.get('enabled') === 'true';
        await setSystemFeature(locals.systemId, feature, enabled);
        return { feature, enabled };
    }
};
