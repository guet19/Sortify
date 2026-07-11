import nodemailer from 'nodemailer';
import { env } from '$env/dynamic/private';

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // Wichtig: Zwingt zu einer verschlüsselten SSL-Verbindung
    auth: {
        user: env.SMTP_EMAIL,
        pass: env.SMTP_PASSWORD
    },
    // Optional, aber auf Netlify oft ein Lebensretter, falls TLS-Zertifikate zicken:
    tls: {
        rejectUnauthorized: false
    }
});

export async function sendVerificationEmail(toEmail, code, token) {
    try {
        const magicLink = `${env.BASE_URL}/verify/${token}`;

        const mailOptions = {
            from: `"Sortify Inventar" <${env.SMTP_EMAIL}>`,
            to: toEmail,
            subject: 'Bitte bestätige deine E-Mail-Adresse',
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                    <h2 style="color: #22c55e; margin-top: 0;">Willkommen bei Sortify!</h2>
                    <p style="color: #334155; font-size: 16px; line-height: 1.5;">Bitte bestätige deine E-Mail-Adresse, um deinen Account für das digitale Kleinteilelager freizuschalten.</p>
                    
                    <p style="color: #334155; font-size: 15px; margin-top: 25px;"><strong>Option 1: Klicke auf diesen Link (Magic Link)</strong></p>
                    <a href="${magicLink}" style="display: inline-block; background-color: #22c55e; color: #0B192C; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                        Account bestätigen
                    </a>
                    
                    <p style="margin-top: 35px; color: #334155; font-size: 15px;"><strong>Option 2: Gib diesen Code auf der Webseite ein</strong></p>
                    <div style="background-color: #f8fafc; padding: 20px; font-size: 28px; letter-spacing: 8px; text-align: center; border-radius: 8px; font-family: monospace; font-weight: bold; color: #16a34a; border: 2px solid #e2e8f0;">
                        ${code}
                    </div>
                    
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin-top: 40px; margin-bottom: 20px;">
                    <p style="font-size: 12px; color: #64748b; margin: 0;">Dieser Code und der Link sind aus Sicherheitsgründen 15 Minuten lang gültig.</p>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("✅ Verifizierungs-Mail gesendet:", info.messageId);
        
    } catch (error) {
        // Dieser Fehler taucht jetzt in den Netlify Logs auf!
        console.error("❌ FEHLER beim Senden der Verifizierungs-Mail:", error);
        throw error; 
    }
}

export async function sendPasswordResetEmail(toEmail, token) {
    try {
        const resetLink = `${env.BASE_URL}/reset-password/${token}`;

        const mailOptions = {
            from: `"Sortify Inventar" <${env.SMTP_EMAIL}>`,
            to: toEmail,
            subject: 'Dein Passwort zurücksetzen',
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                    <h2 style="color: #3b82f6; margin-top: 0;">Passwort zurücksetzen</h2>
                    <p style="color: #334155; font-size: 16px; line-height: 1.5;">Du hast eine Anfrage zum Zurücksetzen deines Passworts für Sortify gestellt.</p>
                    
                    <p style="color: #334155; font-size: 15px; margin-top: 25px;">Klicke auf den untenstehenden Link, um ein neues Passwort zu vergeben:</p>
                    <a href="${resetLink}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; margin-top: 10px;">
                        Neues Passwort setzen
                    </a>
                    
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin-top: 40px; margin-bottom: 20px;">
                    <p style="font-size: 12px; color: #64748b; margin: 0;">Dieser Link ist aus Sicherheitsgründen für 1 Stunde gültig. Wenn du diese Anfrage nicht gestellt hast, kannst du diese E-Mail einfach ignorieren.</p>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("✅ Passwort-Reset-Mail gesendet:", info.messageId);

    } catch (error) {
        console.error("❌ FEHLER beim Senden der Passwort-Reset-Mail:", error);
        throw error;
    }
}

export async function sendSystemInviteEmail(toEmail, inviterName, systemName, token) {
    try {
        const inviteLink = `${env.BASE_URL}/invite/${token}`;

        const mailOptions = {
            from: `"Sortify Inventar" <${env.SMTP_EMAIL}>`,
            to: toEmail,
            subject: `${inviterName} hat dich in ein Sortify-Lager eingeladen`,
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                    <h2 style="color: #3b82f6; margin-top: 0;">Du wurdest eingeladen!</h2>
                    <p style="color: #334155; font-size: 16px; line-height: 1.5;">
                        <strong>${inviterName}</strong> hat dich eingeladen, im Lager <strong>"${systemName}"</strong> mitzuarbeiten.
                    </p>
                    
                    <p style="color: #334155; font-size: 15px; margin-top: 25px;">Klicke auf den untenstehenden Link, um die Einladung anzunehmen:</p>
                    
                    <a href="${inviteLink}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; margin-top: 10px;">
                        Einladung annehmen
                    </a>
                    
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin-top: 40px; margin-bottom: 20px;">
                    <p style="font-size: 12px; color: #64748b; margin: 0;">Dieser Link ist für 7 Tage gültig. Wenn du noch kein Sortify-Konto hast, kannst du nach dem Klick ganz einfach eines erstellen.</p>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("✅ Einladungs-Mail gesendet:", info.messageId);

    } catch (error) {
        console.error("❌ FEHLER beim Senden der Einladungs-Mail:", error);
        throw error;
    }
}

// Neue Funktion in deiner email.js
export async function sendEmailChangeVerification(newEmail, userName, token, baseUrl) {
    const verificationUrl = `${baseUrl}/verify-email/${token}`;

    const mailOptions = {
        from: '"Sortify Inventar" <noreply@sortify.ch>', // Passe den Absender an
        to: newEmail,
        subject: 'Bestätigung deiner neuen E-Mail-Adresse',
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Hallo ${userName},</h2>
                <p>Du hast in deinem Sortify-Profil eine Änderung deiner E-Mail-Adresse beantragt.</p>
                <p>Bitte klicke auf den folgenden Link, um diese E-Mail-Adresse zu bestätigen. Deine Login-Daten werden erst nach dem Klick aktualisiert.</p>
                <div style="margin: 30px 0;">
                    <a href="${verificationUrl}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                        E-Mail-Adresse bestätigen
                    </a>
                </div>
                <p style="font-size: 12px; color: #666;">
                    Dieser Link ist aus Sicherheitsgründen nur 24 Stunden gültig.<br>
                    Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br>
                    ${verificationUrl}
                </p>
            </div>
        `
    };

    return await transporter.sendMail(mailOptions);
}

// Neue Funktion in deiner email.js
export async function sendPasswordChangeVerification(email, userName, token, baseUrl) {
    const verificationUrl = `${baseUrl}/verify-password/${token}`;

    const mailOptions = {
        from: '"Sortify Inventar" <noreply@sortify.ch>',
        to: email,
        subject: 'Sicherheitswarnung: Änderung deines Passworts',
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Hallo ${userName},</h2>
                <p>Es wurde eine Änderung deines Passworts für dein Sortify-Konto beantragt.</p>
                <p>Wenn du das warst, klicke bitte auf den folgenden Link, um das neue Passwort zu aktivieren. Bis dahin bleibt dein altes Passwort gültig.</p>
                <div style="margin: 30px 0;">
                    <a href="${verificationUrl}" style="background-color: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                        Neues Passwort bestätigen
                    </a>
                </div>
                <p style="font-size: 12px; color: #666;">
                    Dieser Link ist aus Sicherheitsgründen nur 2 Stunden gültig.<br>
                    <strong>Falls du diese Änderung nicht beantragt hast, kannst du diese E-Mail einfach ignorieren. Dein Konto ist sicher.</strong>
                </p>
            </div>
        `
    };

    return await transporter.sendMail(mailOptions);
}
export async function send2FABackupCode(email, firstName, code) {
    const subject = "Dein Sortify Notfall-Code für den Login";
    const htmlBody = `
        <div style="font-family: Arial, sans-serif; color: #334155; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #22c55e;">Hallo ${firstName},</h2>
            <p>Du hast angefordert, dich ohne deine Authenticator-App anzumelden.</p>
            <p>Dein temporärer Notfall-Code lautet:</p>
            <div style="font-size: 24px; font-weight: bold; letter-spacing: 5px; padding: 15px; background: #f8fafc; border: 1px solid #cbd5e1; text-align: center; border-radius: 6px; margin: 20px 0;">
                ${code}
            </div>
            <p>Dieser Code ist für <strong>15 Minuten</strong> gültig.</p>
            <p><em>Tipp: Sobald du eingeloggt bist, kannst du deine 2FA in den Profileinstellungen löschen und mit deinem neuen Smartphone neu verbinden.</em></p>
        </div>
    `;

    try {
        const info = await transporter.sendMail({
            from: `"Sortify Inventar" <${env.SMTP_EMAIL}>`,
            to: email,
            subject: subject,
            html: htmlBody
        });
        console.log("✅ 2FA Notfall-Code gesendet:", info.messageId);
        return info;
    } catch (error) {
        console.error("❌ FEHLER beim Senden des 2FA Notfall-Codes:", error);
        throw error;
    }
}