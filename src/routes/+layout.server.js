import { getUserSystems } from '$lib/server/systems.js';

export async function load({ locals }) {
    // Lager für das Dropdown in der Menüleiste (eine DB-Abfrage für alle Namen)
    const systems = locals.user
        ? await getUserSystems((locals.userSystems || []).map(s => ({ ...s, userId: locals.user.id })))
        : [];

    // Die erlaubten Routen hat der Hook bereits ermittelt (spart eine DB-Abfrage pro Seitenaufruf)
    // Diese Daten stehen dem Menü (und allen Unterseiten) nun als $page.data zur Verfügung
    return {
        user: locals.user || null,
        isLoggedIn: !!locals.user,
        role: locals.role || null,
        allowedRoutes: locals.role === 'admin' ? ['*'] : (locals.allowedRoutes || []),
        systems,
        activeSystemId: locals.systemId || null
    };
}
