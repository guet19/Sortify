import db from '$lib/server/db.js';
import { fail, error, redirect } from '@sveltejs/kit';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs'; 
import { sendEmailChangeVerification, sendPasswordChangeVerification } from '$lib/server/email.js'; 

export async function load({ cookies }) {
    const userId = cookies.get('session');
    if (!userId) {
        throw error(401, 'Nicht autorisiert');
    }

    const user = await db.getUserById(userId);
    if (!user) {
        throw error(404, 'Benutzer nicht gefunden');
    }

    let formattedDate = "";
    if (user.birthDate) {
        const d = new Date(user.birthDate);
        formattedDate = d.toISOString().split('T')[0];
    }

    let displayRole = 'user';
    if (user.systems && Array.isArray(user.systems)) {
        if (user.systems.some(sys => sys.role === 'admin')) {
            displayRole = 'admin'; 
        } else if (user.systems.some(sys => sys.role === 'manager')) {
            displayRole = 'manager';
        }
    }

    // --- 2FA LOGIK (Jetzt nur noch für E-Mail Nutzer) ---
    const is2FAEnabled = user.isTwoFactorEnabled === true;
    let qrCodeUrl = '';
    let tempSecret = '';

    // 🔥 FIX: QR-Code und Secret werden nur generiert, wenn eine Mail existiert
    if (!is2FAEnabled && user.email) {
        const identifier = user.email; 
        const secretData = speakeasy.generateSecret({ 
            name: `Sortify (${identifier})` 
        });
        tempSecret = secretData.base32;
        qrCodeUrl = await QRCode.toDataURL(secretData.otpauth_url);
    }

    return {
        profileData: {
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            country: user.country || "",
            birthDate: formattedDate,
            email: user.email || "",
            pendingEmail: user.pendingEmail || null, 
            hasPendingPassword: !!user.pendingPassword, 
            role: displayRole,
            mustChangePassword: user.mustChangePassword || false 
        },
        is2FAEnabled,
        qrCodeUrl,
        tempSecret
    };
}

export const actions = {
    updateProfile: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        if (!userId) {
            return fail(401, { error: "Nicht autorisiert." });
        }

        const data = await request.formData();
        const updateData = {
            firstName: data.get('firstName')?.toString().trim() || "",
            lastName: data.get('lastName')?.toString().trim() || "",
            country: data.get('country')?.toString().trim() || "",
            birthDate: data.get('birthDate') ? new Date(data.get('birthDate')) : null,
            updatedAt: new Date()
        };

        try {
            await db.updateUser(userId, updateData);
            return { success: true, message: "Profil erfolgreich aktualisiert." };
        } catch (e) {
            console.error("Fehler beim Profil-Update:", e);
            return fail(500, { error: "Fehler beim Speichern der Daten." });
        }
    },

    enable2FA: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return fail(401, { error: "Nicht autorisiert." });

        // 🔥 FIX: Harter Server-Check, ob E-Mail vorhanden ist
        const user = await db.getUserById(userId);
        if (!user || !user.email) {
            return fail(403, { error: '2FA kann nur mit einer hinterlegten E-Mail-Adresse aktiviert werden.' });
        }

        const data = await request.formData();
        const code = data.get('code')?.toString().replace(/\s/g, ''); 
        const secret = data.get('tempSecret')?.toString();

        if (!code || !secret) {
            return fail(400, { error: 'Bitte gib den 6-stelligen Code ein.' });
        }

        const isValid = speakeasy.totp.verify({
            secret: secret,
            encoding: 'base32',
            token: code,
            window: 1
        });

        if (!isValid) {
            return fail(400, { error: 'Der Code ist falsch oder abgelaufen. Bitte versuche es erneut.' });
        }

        await db.enableTwoFactor(userId, secret);
        return { success: true, message: 'Zwei-Faktor-Authentifizierung wurde erfolgreich aktiviert!' };
    },

    disable2FA: async ({ cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return fail(401, { error: "Nicht autorisiert." });

        await db.disableTwoFactor(userId);
        return { success: true, message: 'Zwei-Faktor-Authentifizierung wurde deaktiviert.' };
    },

    requestEmailChange: async ({ request, cookies, url }) => {
        const userId = cookies.get('session');
        if (!userId) return fail(401, { error: "Nicht autorisiert." });

        const data = await request.formData();
        const newEmail = data.get('newEmail')?.toString().trim();
        const currentPassword = data.get('currentPassword')?.toString(); 

        if (!newEmail || !currentPassword) {
            return fail(400, { emailError: 'Bitte fülle alle Felder aus.' });
        }

        const user = await db.getUserById(userId);
        if (!user) return fail(404, { emailError: 'Benutzer nicht gefunden.' });
        
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
            return fail(400, { emailError: 'Das eingegebene Passwort ist falsch.' });
        }

        if (newEmail.toLowerCase() === (user.email || '').toLowerCase()) {
            return fail(400, { emailError: 'Das ist bereits deine aktuelle E-Mail-Adresse.' });
        }

        const result = await db.requestEmailChange(userId, newEmail);

        if (!result.success) {
            return fail(400, { emailError: result.message });
        }

        try {
            await sendEmailChangeVerification(newEmail, user.firstName || 'Benutzer', result.token, url.origin);
            return { emailSuccess: `Ein Bestätigungslink wurde an ${newEmail} gesendet!` };
        } catch (err) {
            console.error(err);
            return fail(500, { emailError: 'Fehler beim Senden der Bestätigungsmail.' });
        }
    },

    requestPasswordChange: async ({ request, cookies, url }) => {
        const userId = cookies.get('session');
        if (!userId) return fail(401, { error: "Nicht autorisiert." });

        const data = await request.formData();
        const currentPassword = data.get('currentPassword')?.toString();
        const newPassword = data.get('newPassword')?.toString();
        const confirmPassword = data.get('confirmPassword')?.toString();

        if (!currentPassword || !newPassword || !confirmPassword) {
            return fail(400, { pwError: 'Bitte fülle alle Passwort-Felder aus.' });
        }

        if (newPassword !== confirmPassword) {
            return fail(400, { pwError: 'Die neuen Passwörter stimmen nicht überein.' });
        }

        if (newPassword.length < 8) {
            return fail(400, { pwError: 'Das neue Passwort muss mindestens 8 Zeichen lang sein.' });
        }

        const user = await db.getUserById(userId);
        if (!user) return fail(404, { pwError: 'Benutzer nicht gefunden.' });
        
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
            return fail(400, { pwError: 'Das aktuelle Passwort ist falsch.' });
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        if (!user.email) {
            await db.changePasswordDirectly(userId, hashedNewPassword);
            return { pwSuccess: 'Dein Passwort wurde erfolgreich geändert! Du hast nun vollen Zugriff.' };
        }

        const result = await db.requestPasswordChange(userId, hashedNewPassword);

        if (!result.success) {
            return fail(400, { pwError: 'Fehler bei der Beantragung.' });
        }

        try {
            await sendPasswordChangeVerification(user.email, user.firstName || 'Benutzer', result.token, url.origin);
            return { pwSuccess: 'Ein Bestätigungslink wurde an deine E-Mail-Adresse gesendet!' };
        } catch (err) {
            console.error(err);
            return fail(500, { pwError: 'Fehler beim Senden der Bestätigungsmail.' });
        }
    },
    
    cancelPasswordChange: async ({ cookies }) => {
        cookies.delete('session', { path: '/' });
        cookies.delete('systemId', { path: '/' });
        cookies.delete('pending2fa', { path: '/' });
        
        throw redirect(303, '/');
    }
};