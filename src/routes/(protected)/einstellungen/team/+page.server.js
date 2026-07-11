import db from '$lib/server/db.js';
import { fail, error } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { ObjectId } from 'mongodb'; // 🔥 Hinzugefügt, damit das Löschen fehlerfrei klappt

const currentSystemId = "6a4ea775e94b7120d470bea7";

export async function load({ cookies }) {
    const userId = cookies.get('session');
    if (!userId) {
        throw error(401, 'Nicht autorisiert');
    }

    const user = await db.getUserById(userId);
    if (!user) {
        throw error(404, 'Benutzer nicht gefunden');
    }

    const systemContext = user.systems?.find(s => s.systemId?.toString() === currentSystemId);
    if (!systemContext) {
        throw error(403, 'Kein Zugriff auf dieses System');
    }

    const members = await db.getUsersBySystem(currentSystemId);

    const serializedMembers = members.map(m => {
        const sys = m.systems?.find(s => s.systemId?.toString() === currentSystemId);
        return {
            id: m._id?.toString() || 'unknown',
            username: m.username || null,
            email: m.email || null,
            firstName: m.firstName || '',
            lastName: m.lastName || '',
            role: sys ? sys.role : 'user',
            mustChangePassword: m.mustChangePassword || false,
            isVerified: m.isVerified !== false
        };
    });

    return {
        members: serializedMembers,
        currentUserId: userId,
        currentUserRole: systemContext.role
    };
}

export const actions = {
    createLocalUser: async ({ request, cookies }) => {
        const adminId = cookies.get('session');
        if (!adminId) return fail(401, { error: 'Nicht autorisiert.' });

        const data = await request.formData();
        const username = data.get('username')?.toString().trim();
        const role = data.get('role')?.toString();

        if (!username || !role) return fail(400, { localError: 'Bitte fülle alle Felder aus.' });

        const plainPassword = crypto.randomBytes(4).toString('hex'); 
        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        const result = await db.createLocalSystemUser(currentSystemId, username, hashedPassword, role);

        if (!result.success) return fail(400, { localError: result.message });

        return { 
            success: true, 
            type: 'local',
            username: username,
            plainPassword: plainPassword 
        };
    },

    inviteEmailUser: async ({ request, cookies, url }) => {
        const adminId = cookies.get('session');
        if (!adminId) return fail(401, { error: 'Nicht autorisiert.' });

        const data = await request.formData();
        const email = data.get('email')?.toString().trim();
        const role = data.get('role')?.toString();

        if (!email || !role) return fail(400, { emailError: 'Bitte gib eine E-Mail-Adresse ein.' });

        const result = await db.inviteUserToSystem(currentSystemId, email, role);
        
        if (!result.success) return fail(400, { emailError: result.message });

        if (result.status === 'existing_added') {
            return { success: true, type: 'email', message: `${email} wurde erfolgreich hinzugefügt.` };
        } else {
            return { success: true, type: 'email', message: `Einladungs-Link gesendet an ${email}.` };
        }
    },

    updateRole: async ({ request, cookies }) => {
        const adminId = cookies.get('session');
        if (!adminId) return fail(401, { error: 'Nicht autorisiert.' });

        const data = await request.formData();
        const targetUserId = data.get('targetUserId')?.toString();
        const newRole = data.get('newRole')?.toString();

        if (!targetUserId || !newRole) return fail(400, { tableError: 'Ungültige Daten.' });
        if (targetUserId === adminId) return fail(400, { tableError: 'Eigene Rolle nicht änderbar.' });

        await db.updateUserSystemRole(currentSystemId, targetUserId, newRole);
        return { success: true };
    },

    removeUser: async ({ request, cookies }) => {
        const adminId = cookies.get('session');
        if (!adminId) return fail(401, { tableError: 'Nicht autorisiert.' });

        const data = await request.formData();
        const targetUserId = data.get('targetUserId')?.toString();

        if (!targetUserId) return fail(400, { tableError: 'Ungültige Daten.' });
        if (targetUserId === adminId) return fail(400, { tableError: 'Du kannst dich nicht selbst entfernen.' });

        const user = await db.getUserById(targetUserId);
        if (!user) return fail(404, { tableError: 'Mitarbeiter nicht gefunden.' });

        if (!user.email) {
            // 🔥 Jetzt funktioniert auch das Löschen dank importierter ObjectId fehlerfrei!
            const database = await db.getDb();
            await database.collection('users').deleteOne({ _id: new ObjectId(targetUserId) });
        } else {
            await db.removeUserFromSystem(currentSystemId, targetUserId);
        }

        return { success: true };
    }
};