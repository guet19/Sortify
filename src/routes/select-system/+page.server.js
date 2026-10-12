import { redirect, fail } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { safeRedirect } from '$lib/server/security.js';

export async function load({ locals }) {
    // 1. Ist der User überhaupt eingeloggt?
    if (!locals.user) {
        throw redirect(303, '/login');
    }

    // 2. Den User aus der DB holen, um seine Systeme zu sehen
    const user = await db.getUserById(locals.user.id);
    
    if (!user || !user.systems || user.systems.length === 0) {
        return { systems: [] };
    }

    // 3. Die echten Namen der Systeme aus der Datenbank laden
    const systemsWithNames = await Promise.all(user.systems.map(async (s) => {
        const systemData = await db.getSystemById(s.systemId);
        return {
            id: s.systemId.toString(),
            role: s.role,
            name: systemData ? systemData.name : 'Unbekanntes Lager'
        };
    }));

    return {
        systems: systemsWithNames
    };
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
        const user = await db.getUserById(locals.user.id);
        if (!user?.systems?.some(s => s.systemId === systemId)) {
            return fail(403, { error: 'Kein Zugriff auf dieses Lager.' });
        }

        // 4. Das ausgewählte Lager als Cookie setzen!
        cookies.set('systemId', systemId, {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24 * 7 // 1 Woche
        });

        // 5. Zurück dorthin, wo der User ursprünglich hinwollte
        const redirectTo = safeRedirect(url.searchParams.get('redirectTo'));
        throw redirect(303, redirectTo);
    }
};