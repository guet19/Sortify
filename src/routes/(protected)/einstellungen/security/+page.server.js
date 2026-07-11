import { error, fail } from '@sveltejs/kit';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import db from '$lib/server/db.js';

export async function load({ locals }) {
    if (!locals.user) throw error(401, 'Nicht eingeloggt');

    const user = await db.getUserById(locals.user.id);
    const is2FAEnabled = user.isTwoFactorEnabled === true;

    let qrCodeUrl = '';
    let tempSecret = '';

    if (!is2FAEnabled) {
        const identifier = user.email || user.username;
        
        // 1. Geheimen Schlüssel & otpauth-URL mit speakeasy generieren
        const secretData = speakeasy.generateSecret({ 
            name: `Sortify (${identifier})` 
        });
        
        // Wir speichern den Base32-String als Secret
        tempSecret = secretData.base32;
        
        // 2. Den Link in ein Base64-Bild (QR-Code) umwandeln
        qrCodeUrl = await QRCode.toDataURL(secretData.otpauth_url);
    }

    return {
        is2FAEnabled,
        qrCodeUrl,
        tempSecret
    };
}

export const actions = {
    // Aktion: 2FA nach dem Scannen verifizieren und aktivieren
    enable2FA: async ({ request, locals }) => {
        const data = await request.formData();
        const code = data.get('code')?.toString().replace(/\s/g, ''); 
        const secret = data.get('tempSecret')?.toString();

        if (!code || !secret) {
            return fail(400, { error: 'Bitte gib den 6-stelligen Code ein.' });
        }

        // Prüfen, ob der Code zum Geheimschlüssel passt
        const isValid = speakeasy.totp.verify({
            secret: secret,
            encoding: 'base32',
            token: code,
            window: 1 // Erlaubt ein kleines Zeitfenster, falls die Handy-Uhr minimal abweicht
        });

        if (!isValid) {
            return fail(400, { error: 'Der Code ist falsch oder abgelaufen. Bitte versuche es erneut.' });
        }

        // Erfolg! In der Datenbank festschreiben
        await db.enableTwoFactor(locals.user.id, secret);
        return { success: 'Zwei-Faktor-Authentifizierung wurde erfolgreich aktiviert!' };
    },

    // Aktion: 2FA wieder abschalten
    disable2FA: async ({ locals }) => {
        await db.disableTwoFactor(locals.user.id);
        return { success: 'Zwei-Faktor-Authentifizierung wurde deaktiviert.' };
    }
};