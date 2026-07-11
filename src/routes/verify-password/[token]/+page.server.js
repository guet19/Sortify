import db from '$lib/server/db.js';

export async function load({ params }) {
    const token = params.token;
    
    // Token prüfen und Passwort in der DB überschreiben
    const result = await db.confirmPasswordChange(token);

    return {
        success: result.success,
        message: result.message
    };
}