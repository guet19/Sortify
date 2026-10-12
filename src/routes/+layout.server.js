export async function load({ locals }) {
    // Die erlaubten Routen hat der Hook bereits ermittelt (spart eine DB-Abfrage pro Seitenaufruf)
    // Diese Daten stehen dem Menü (und allen Unterseiten) nun als $page.data zur Verfügung
    return {
        user: locals.user || null,
        isLoggedIn: !!locals.user,
        role: locals.role || null,
        allowedRoutes: locals.role === 'admin' ? ['*'] : (locals.allowedRoutes || [])
    };
}
