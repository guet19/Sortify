import db from '$lib/server/db.js';

export async function load({ params }) {
    const token = params.token;
    
    // Token prüfen und Mail in der DB überschreiben
    const result = await db.confirmEmailChange(token);

    return {
        success: result.success,
        message: result.message
    };
}