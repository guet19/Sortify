import { fail, redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { cookieOptions } from '$lib/server/session.js';

// Jeder Nutzer darf höchstens so viele eigene Lager anlegen
export const MAX_OWN_SYSTEMS = 3;

const DEFAULT_ROLE_NAMES = { admin: 'Administrator', user: 'Benutzer' };

// Alle Lager eines Nutzers inkl. Name und Rollenbezeichnung (für Menü, Auswahl und Lagerverwaltung)
export async function getUserSystems(userSystems = []) {
    if (!userSystems.length) return [];
    const systems = await db.getSystemsByIds(userSystems.map(s => s.systemId));

    return userSystems.map(membership => {
        const system = systems.find(s => s._id === membership.systemId);
        const customRole = system?.roles?.find(r => r.roleId === membership.role);
        return {
            id: membership.systemId,
            name: system?.name || 'Unbekanntes Lager',
            role: membership.role,
            roleName: customRole?.name || DEFAULT_ROLE_NAMES[membership.role] || membership.role,
            isOwner: !!system?.createdBy && system.createdBy === membership.userId
        };
    });
}

// Übersicht inkl. Zähler für eigene Lager
export async function getSystemsOverview(userId, userSystems) {
    const [systems, ownedCount] = await Promise.all([
        getUserSystems(userSystems.map(s => ({ ...s, userId }))),
        db.countSystemsCreatedBy(userId)
    ]);
    return {
        systems,
        ownedCount,
        maxOwnSystems: MAX_OWN_SYSTEMS,
        canCreate: ownedCount < MAX_OWN_SYSTEMS
    };
}

// Gemeinsame Form-Action "Lager erstellen" (Lagerauswahl & Lagerverwaltung)
export async function createSystemAction({ request, cookies, locals }) {
    if (!locals.user) throw redirect(303, '/login');

    const data = await request.formData();
    const name = data.get('name')?.toString().trim();

    if (!name || name.length < 2 || name.length > 60) {
        return fail(400, { createError: 'Der Name muss zwischen 2 und 60 Zeichen lang sein.', name });
    }

    if (await db.countSystemsCreatedBy(locals.user.id) >= MAX_OWN_SYSTEMS) {
        return fail(403, { createError: `Du kannst maximal ${MAX_OWN_SYSTEMS} eigene Lager erstellen.`, name });
    }

    const systemId = await db.createSystem(locals.user.id, name);

    // Neues Lager direkt aktivieren
    cookies.set('systemId', systemId, cookieOptions(60 * 60 * 24 * 7));
    throw redirect(303, '/');
}
