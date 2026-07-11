import db from '$lib/server/db.js';
import { fail, error } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// Importiere hier später deine E-Mail-Funktion, sobald du sie in der email.js angelegt hast:
// import { sendSystemInvite } from '$lib/server/email.js';

// Die System-ID ist hier für den Moment fest codiert. 
// (Später kann diese dynamisch über z.B. das Profil oder die URL ausgelesen werden)
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

    // Prüfen, ob der aktuelle User Zugriff auf dieses System hat
    const systemContext = user.systems?.find(s => s.systemId.toString() === currentSystemId);
    if (!systemContext) {
        throw error(403, 'Kein Zugriff auf dieses System');
    }

    // Alle Benutzer laden, die diesem System zugeordnet sind.
    // HINWEIS: Stelle sicher, dass du eine Funktion wie getUsersBySystem in db.js hast.
    // z.B.: async function getUsersBySystem(systemId) { return await db.collection('users').find({ "systems.systemId": new ObjectId(systemId) }).toArray(); }
    const members = await db.getUsersBySystem(currentSystemId);

    // Daten für das Svelte-Frontend serialisieren (MongoDB ObjectIds und sensible Daten bereinigen)
    const serializedMembers = members.map(m => {
        const sys = m.systems.find(s => s.systemId.toString() === currentSystemId);
        return {
            id: m._id.toString(),
            username: m.username || null,
            email: m.email || null,
            firstName: m.firstName || '',
            lastName: m.lastName || '',
            role: sys ? sys.role : 'user',
            mustChangePassword: m.mustChangePassword || false,
            isVerified: m.isVerified !== false // Falls isVerified fehlt, gehen wir von true aus
        };
    });

    return {
        members: serializedMembers,
        currentUserId: userId,
        currentUserRole: systemContext.role
    };
}

export const actions = {
    // -------------------------------------------------------------------------
    // LOKALEN BENUTZER ERSTELLEN (OHNE E-MAIL)
    // -------------------------------------------------------------------------
    createLocalUser: async ({ request, cookies }) => {
        const adminId = cookies.get('session');
        if (!adminId) return fail(401, { error: 'Nicht autorisiert.' });

        const data = await request.formData();
        const username = data.get('username')?.toString().trim();
        const role = data.get('role')?.toString();

        if (!username || !role) {
            return fail(400, { localError: 'Bitte fülle alle Felder aus.' });
        }

        // 1. Zufälliges temporäres Passwort generieren (8 Zeichen hex)
        const plainPassword = crypto.randomBytes(4).toString('hex'); 
        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        // 2. In der Datenbank speichern
        const result = await db.createLocalSystemUser(currentSystemId, username, hashedPassword, role);

        if (!result.success) {
            return fail(400, { localError: result.message });
        }

        // 3. Erfolgsmeldung und Klartext-Passwort ans Frontend zurückgeben (Nur für das PDF!)
        return { 
            success: true, 
            type: 'local',
            username: username,
            plainPassword: plainPassword 
        };
    },

    // -------------------------------------------------------------------------
    // E-MAIL BENUTZER EINLADEN
    // -------------------------------------------------------------------------
    inviteEmailUser: async ({ request, cookies, url }) => {
        const adminId = cookies.get('session');
        if (!adminId) return fail(401, { error: 'Nicht autorisiert.' });

        const data = await request.formData();
        const email = data.get('email')?.toString().trim();
        const role = data.get('role')?.toString();

        if (!email || !role) {
            return fail(400, { emailError: 'Bitte gib eine E-Mail-Adresse ein.' });
        }

        // 1. User in der Datenbank prüfen / anlegen (Funktion aus db.js)
        const result = await db.inviteUserToSystem(currentSystemId, email, role);
        
        if (!result.success) {
            return fail(400, { emailError: result.message });
        }

        // 2. Je nach Status reagieren (Existierender Account vs. Neuer Hüllen-Account)
        if (result.status === 'existing_added') {
            // Das Konto gab es schon und wurde einfach dem System zugewiesen.
            return { 
                success: true, 
                type: 'email', 
                message: `${email} wurde erfolgreich zum Lager hinzugefügt.` 
            };
        } else {
            // Neuer Account wurde angelegt, jetzt muss der Token an den Nutzer gesendet werden.
            
            // HIER WIRD SPÄTER DER E-MAIL-VERSAND EINGEBAUT:
            // try {
            //     await sendSystemInvite(email, result.token, url.origin);
            // } catch (err) {
            //     console.error("Mail-Fehler:", err);
            //     return fail(500, { emailError: 'Konto erstellt, aber E-Mail konnte nicht gesendet werden.' });
            // }
            
            return { 
                success: true, 
                type: 'email', 
                message: `Einladungs-Link wurde erfolgreich an ${email} gesendet.` 
            };
        }
    },
    // -------------------------------------------------------------------------
    // ROLLE ÄNDERN
    // -------------------------------------------------------------------------
    updateRole: async ({ request, cookies }) => {
        const adminId = cookies.get('session');
        if (!adminId) return fail(401, { error: 'Nicht autorisiert.' });

        const data = await request.formData();
        const targetUserId = data.get('targetUserId')?.toString();
        const newRole = data.get('newRole')?.toString();

        if (!targetUserId || !newRole) return fail(400, { tableError: 'Ungültige Daten.' });
        
        // Selbst-Demotion verhindern
        if (targetUserId === adminId) {
            return fail(400, { tableError: 'Du kannst deine eigene Rolle nicht ändern.' });
        }

        await db.updateUserSystemRole(currentSystemId, targetUserId, newRole);
        return { success: true };
    },

    // -------------------------------------------------------------------------
    // BENUTZER ENTFERNEN
    // -------------------------------------------------------------------------
    removeUser: async ({ request, cookies }) => {
        const adminId = cookies.get('session');
        if (!adminId) return fail(401, { error: 'Nicht autorisiert.' });

        const data = await request.formData();
        const targetUserId = data.get('targetUserId')?.toString();

        if (!targetUserId) return fail(400, { tableError: 'Ungültige Daten.' });

        // Selbst-Löschung verhindern
        if (targetUserId === adminId) {
            return fail(400, { tableError: 'Du kannst dich nicht selbst aus dem System entfernen.' });
        }

        await db.removeUserFromSystem(currentSystemId, targetUserId);
        return { success: true };
    },
    // -------------------------------------------------------------------------
    // BENUTZER ENTFERNEN (Jetzt mit physikalischer Löschung für Offline-User)
    // -------------------------------------------------------------------------
    removeUser: async ({ request, cookies }) => {
        const adminId = cookies.get('session');
        if (!adminId) return fail(401, { tableError: 'Nicht autorisiert.' });

        const data = await request.formData();
        const targetUserId = data.get('targetUserId')?.toString();

        if (!targetUserId) return fail(400, { tableError: 'Ungültige Daten.' });

        if (targetUserId === adminId) {
            return fail(400, { tableError: 'Du kannst dich nicht selbst entfernen.' });
        }

        // 1. Hole den aktuellen Zustand des Benutzers aus der DB
        const user = await db.getUserById(targetUserId);
        if (!user) return fail(404, { tableError: 'Mitarbeiter nicht gefunden.' });

        // 2. Weiche: Hat der Benutzer eine E-Mail-Adresse?
        if (!user.email) {
            // 🔥 Lokaler Account -> Komplett aus der "users" Collection löschen
            // Falls du eine Funktion in db.js bauen willst: db.collection('users').deleteOne({ _id: new ObjectId(userId) });
            await db.deleteUserCompletely?.(targetUserId) || await (await db.getDb()).collection('users').deleteOne({ _id: new db.ObjectId(targetUserId) });
        } else {
            // E-Mail Account -> Nur die System-Verknüpfung für dieses Lager lösen
            await db.removeUserFromSystem(currentSystemId, targetUserId);
        }

        return { success: true };
    }
};