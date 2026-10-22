import { fail, redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { cookieOptions } from '$lib/server/session.js';
import { deleteUnusedImages } from '$lib/server/articleImages.js';

// Jeder Nutzer darf höchstens so viele eigene Lager anlegen
export const MAX_OWN_SYSTEMS = 3;

const DEFAULT_ROLE_NAMES = { admin: 'Administrator', user: 'Benutzer' };

function canDeleteSystem(system, userId, role) {
    if (!system) return false;
    return system.createdBy ? system.createdBy === userId : role === 'admin';
}

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
            isOwner: !!system?.createdBy && system.createdBy === membership.userId,
            // Löschen darf nur der Ersteller; bei alten Lagern ohne gespeicherten Ersteller die Admins
            canDelete: canDeleteSystem(system, membership.userId, membership.role),
            // Zuschaltbare Funktionen dieses Lagers, z.B. { projects: true }
            features: system?.features || {}
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

// Form-Action "Lager löschen": nur Ersteller, Bestätigung durch Eintippen des Lagernamens.
// Löscht alle Daten des Lagers und die zugehörigen Artikelbilder bei Cloudinary.
export async function deleteSystemAction({ request, cookies, locals }) {
    if (!locals.user) throw redirect(303, '/login');

    const data = await request.formData();
    const systemId = data.get('systemId')?.toString() || '';
    const confirmName = data.get('confirmName')?.toString().trim() || '';

    const membership = (locals.userSystems || []).find(s => s.systemId === systemId);
    if (!membership) return fail(403, { deleteError: 'Kein Zugriff auf dieses Lager.', systemId });

    const [system] = await db.getSystemsByIds([systemId]);
    if (!system) return fail(404, { deleteError: 'Lager nicht gefunden.', systemId });
    if (!canDeleteSystem(system, locals.user.id, membership.role)) {
        return fail(403, { deleteError: 'Nur der Ersteller des Lagers darf es löschen.', systemId });
    }
    if (confirmName !== system.name) {
        return fail(400, { deleteError: 'Der eingegebene Name stimmt nicht mit dem Lagernamen überein.', systemId });
    }

    const imageUrls = await db.getSystemImageUrls(systemId);
    await db.deleteSystemCompletely(systemId);
    await deleteUnusedImages(imageUrls, db.isImageInUse);

    // War es das aktive Lager, muss ein anderes gewählt werden
    if (cookies.get('systemId') === systemId) cookies.delete('systemId', { path: '/' });

    return { deleted: system.name };
}
