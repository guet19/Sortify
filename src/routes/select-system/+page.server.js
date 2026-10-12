import { redirect, fail } from '@sveltejs/kit';
import { safeRedirect } from '$lib/server/security.js';
import { cookieOptions } from '$lib/server/session.js';
import { getSystemsOverview, createSystemAction } from '$lib/server/systems.js';

export async function load({ locals }) {
    // 1. Ist der User überhaupt eingeloggt?
    if (!locals.user) {
        throw redirect(303, '/login');
    }

    // 2. Lager inkl. Namen (eine Abfrage) und Zähler für eigene Lager
    return await getSystemsOverview(locals.user.id, locals.userSystems || []);
}

export const actions = {
    select: async ({ request, cookies, url, locals }) => {
        if (!locals.user) throw redirect(303, '/login');

        const data = await request.formData();
        const systemId = data.get('systemId')?.toString();

        if (!systemId) {
            return fail(400, { error: 'Kein System ausgewählt.' });
        }

        // Nur Lager akzeptieren, in denen der Nutzer auch Mitglied ist
        if (!(locals.userSystems || []).some(s => s.systemId === systemId)) {
            return fail(403, { error: 'Kein Zugriff auf dieses Lager.' });
        }

        // Das ausgewählte Lager als Cookie setzen
        cookies.set('systemId', systemId, cookieOptions(60 * 60 * 24 * 7));

        // Zurück dorthin, wo der User ursprünglich hinwollte
        throw redirect(303, safeRedirect(url.searchParams.get('redirectTo')));
    },

    // Eigenes, neues Lager anlegen – der Ersteller wird Administrator
    createSystem: createSystemAction
};
