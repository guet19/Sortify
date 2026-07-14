import db from '$lib/server/db.js';
import { fail, error } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { ObjectId } from 'mongodb'; 

export async function load({ locals }) {
    // 1. Sichere Daten aus dem Hook (locals) abrufen
    const systemId = locals.systemId;
    const userId = locals.user?.id;
    const userRole = locals.role;

    if (!systemId) {
        throw error(400, 'Kein aktives System ausgewählt.');
    }

    // 2. Mitarbeiter und Rollen aus der Datenbank laden
    const members = await db.getUsersBySystem(systemId);
    const roles = await db.getSystemRoles(systemId); 

    // 3. Mitarbeiter serialisieren
    const serializedMembers = members.map(m => {
        const sys = m.systems?.find(s => s.systemId?.toString() === systemId);
        return {
            id: m._id?.toString() || 'unknown',
            username: m.username || null,
            email: m.email || null,
            firstName: m.firstName || '',
            lastName: m.lastName || '',
            role: sys ? sys.role : 'user',
            // 🔥 NEU: Die Farbe an das Frontend (Tabelle) weitergeben
            color: sys?.color || '#3b82f6', 
            mustChangePassword: m.mustChangePassword || false,
            isVerified: m.isVerified !== false
        };
    });

    return {
        members: serializedMembers,
        roles: roles, 
        currentUserId: userId,
        currentUserRole: userRole
    };
}

export const actions = {
    createLocalUser: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { error: 'Nicht autorisiert.' });

        const data = await request.formData();
        const username = data.get('username')?.toString().trim();
        const role = data.get('role')?.toString();
        // 🔥 NEU: Farbe aus dem Formular auslesen
        const color = data.get('color')?.toString() || '#3b82f6';

        if (!username || !role) return fail(400, { localError: 'Bitte fülle alle Felder aus.' });

        const plainPassword = crypto.randomBytes(4).toString('hex'); 
        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        // 🔥 NEU: color als 5. Parameter übergeben
        const result = await db.createLocalSystemUser(systemId, username, hashedPassword, role, color);

        if (!result.success) return fail(400, { localError: result.message });

        return { 
            success: true, 
            type: 'local',
            username: username,
            plainPassword: plainPassword 
        };
    },

    inviteEmailUser: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { error: 'Nicht autorisiert.' });

        const data = await request.formData();
        const email = data.get('email')?.toString().trim();
        const role = data.get('role')?.toString();
        // 🔥 NEU: Farbe aus dem Formular auslesen
        const color = data.get('color')?.toString() || '#3b82f6';

        if (!email || !role) return fail(400, { emailError: 'Bitte gib eine E-Mail-Adresse ein.' });

        // 🔥 NEU: color als 4. Parameter übergeben
        const result = await db.inviteUserToSystem(systemId, email, role, color);
        
        if (!result.success) return fail(400, { emailError: result.message });

        if (result.status === 'existing_added') {
            return { success: true, type: 'email', message: `${email} wurde erfolgreich hinzugefügt.` };
        } else {
            return { success: true, type: 'email', message: `Einladungs-Link gesendet an ${email}.` };
        }
    },

    updateRole: async ({ request, locals }) => {
        const systemId = locals.systemId;
        const adminId = locals.user?.id;
        
        if (!systemId || !adminId) return fail(401, { error: 'Nicht autorisiert.' });

        const data = await request.formData();
        const targetUserId = data.get('targetUserId')?.toString();
        const newRole = data.get('newRole')?.toString();

        if (!targetUserId || !newRole) return fail(400, { tableError: 'Ungültige Daten.' });
        if (targetUserId === adminId) return fail(400, { tableError: 'Eigene Rolle nicht änderbar.' });

        await db.updateUserSystemRole(systemId, targetUserId, newRole);
        return { success: true };
    },

    // 🔥 NEU: Hier ist die fehlende Action für das Speichern der Farbe!
    updateColor: async ({ request, locals }) => {
        const systemId = locals.systemId;
        const adminId = locals.user?.id;
        
        if (!systemId || !adminId) return fail(401, { error: 'Nicht autorisiert.' });

        const data = await request.formData();
        const targetUserId = data.get('targetUserId')?.toString();
        const newColor = data.get('newColor')?.toString();

        if (!targetUserId || !newColor) return fail(400, { tableError: 'Ungültige Daten.' });

        // Farbe in der Datenbank aktualisieren (Diese Funktion muss in der db.js existieren!)
        await db.updateUserSystemColor(systemId, targetUserId, newColor);
        
        return { success: true };
    },

    removeUser: async ({ request, locals }) => {
        const systemId = locals.systemId;
        const adminId = locals.user?.id;
        
        if (!systemId || !adminId) return fail(401, { tableError: 'Nicht autorisiert.' });

        const data = await request.formData();
        const targetUserId = data.get('targetUserId')?.toString();

        if (!targetUserId) return fail(400, { tableError: 'Ungültige Daten.' });
        if (targetUserId === adminId) return fail(400, { tableError: 'Du kannst dich nicht selbst entfernen.' });

        const user = await db.getUserById(targetUserId);
        if (!user) return fail(404, { tableError: 'Mitarbeiter nicht gefunden.' });

        if (!user.email) {
            const database = await db.getDb();
            await database.collection('users').deleteOne({ _id: new ObjectId(targetUserId) });
        } else {
            await db.removeUserFromSystem(systemId, targetUserId);
        }

        return { success: true };
    }
};