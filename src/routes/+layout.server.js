import db from '$lib/server/db.js';

export async function load({ locals }) {
    let allowedRoutes = [];
    
    // Wenn der User eingeloggt ist, ein System ausgewählt hat und KEIN Voll-Admin ist
    if (locals.user && locals.systemId && locals.role && locals.role !== 'admin') {
        const systemRoles = await db.getSystemRoles(locals.systemId);
        const roleDef = systemRoles.find(r => r.roleId === locals.role);
        
        if (roleDef) {
            allowedRoutes = roleDef.allowedRoutes;
        }
    }

    // Diese Daten stehen dem Menü (und allen Unterseiten) nun als $page.data zur Verfügung
    return {
        user: locals.user || null,
        isLoggedIn: !!locals.user,
        role: locals.role || null,
        allowedRoutes: locals.role === 'admin' ? ['*'] : allowedRoutes
    };
}