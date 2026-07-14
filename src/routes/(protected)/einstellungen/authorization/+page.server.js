import db from '$lib/server/db.js';
import { fail, error } from '@sveltejs/kit';

export async function load({ locals }) {
    const systemId = locals.systemId;
    
    // Doppelte Absicherung: Nur Admins dürfen in die Rollenverwaltung
    if (locals.role !== 'admin') {
        throw error(403, 'Nur Administratoren dürfen Systemrollen verwalten.');
    }

    const roles = await db.getSystemRoles(systemId);
    
    // Die Liste der Routen, die du mit Checkboxen vergeben kannst
    const availableRoutes = [
        { path: '/', name: 'Inventar (Startseite)' },
        
        // Artikel-Management
        { path: '/addarticle', name: 'Artikel hinzufügen' },
        { path: '/editarticle', name: 'Artikel bearbeiten' },
        
        // Einstellungen
        { path: '/einstellungen/authorization', name: 'Berechtigungsverwaltung' },
        { path: '/einstellungen/category', name: 'Kategorien verwalten' },
        { path: '/einstellungen/filter_attributes', name: 'Filter & Attribute' },
        { path: '/einstellungen/security', name: 'Sicherheitseinstellungen' },
        { path: '/einstellungen/team', name: 'Teamverwaltung inkl. Rollen' },

        // Terminal & Terminal-Settings
        { path: '/terminal', name: 'Terminal: Suche & Rückgabe' },
        { path: '/terminal/settings/assign', name: 'Terminal-Hardware: Zuweisung' },
        { path: '/terminal/settings/maintenance', name: 'Terminal-Hardware: Wartung' },
        { path: '/terminal/settings/shelf', name: 'Terminal-Hardware: Regalverwaltung' }
    ];

    return {
        roles,
        availableRoutes
    };
}

export const actions = {
    createRole: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (locals.role !== 'admin') return fail(403, { error: 'Nicht autorisiert' });

        const data = await request.formData();
        const roleName = data.get('roleName')?.toString().trim();
        
        // SvelteKit-Trick: getAll holt alle aktiven Checkboxen mit dem Namen 'routes' als Array!
        const allowedRoutes = data.getAll('routes'); 
        
        // 🔥 NEU: Die ausgewählte Startseite aus dem Dropdown abgreifen
        const startPage = data.get('startPage')?.toString() || '/';

        if (!roleName) return fail(400, { error: 'Bitte einen Namen für die Rolle eingeben.' });
        if (allowedRoutes.length === 0) return fail(400, { error: 'Bitte wähle mindestens eine Berechtigung aus.' });

        // 🔥 NEU: startPage als 4. Parameter an die Datenbank-Funktion übergeben
        await db.createSystemRole(systemId, roleName, allowedRoutes, startPage);
        return { success: true };
    },

    deleteRole: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (locals.role !== 'admin') return fail(403, { error: 'Nicht autorisiert' });

        const data = await request.formData();
        const roleId = data.get('roleId')?.toString();

        if (!roleId) return fail(400, { error: 'Ungültige Rolle' });

        const result = await db.deleteSystemRole(systemId, roleId);
        if (!result.success) return fail(400, { error: result.message });

        return { success: true };
    }
};