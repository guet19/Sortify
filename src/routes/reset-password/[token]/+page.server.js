import { fail, redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { passwordError } from '$lib/server/security.js';

// Wird aufgerufen, wenn der Nutzer auf den Link in der E-Mail klickt
export async function load({ params }) {
    const user = await db.getUserByResetToken(params.token);
    
    // Token ungültig oder abgelaufen? Direkt zur Fehlerseite/Login schicken.
    if (!user) {
        throw redirect(303, '/login?resetError=true');
    }
    
    return { token: params.token };
}

export const actions = {
    default: async ({ request, params }) => {
        const data = await request.formData();
        const password = data.get('password')?.toString() || '';
        const passwordConfirm = data.get('passwordConfirm')?.toString() || '';

        const pwError = passwordError(password);
        if (pwError) return fail(400, { error: pwError });
        if (password !== passwordConfirm) return fail(400, { error: 'Die Passwörter stimmen nicht überein.' });

        const user = await db.getUserByResetToken(params.token);
        if (!user) return fail(400, { error: 'Token abgelaufen. Bitte fordere einen neuen Link an.' });

        const success = await db.resetUserPassword(user._id, password);
        
        if (success) {
            // Umleiten zum Login mit Erfolgs-Parameter
            throw redirect(303, '/login?passwordReset=true');
        } else {
            return fail(500, { error: 'Ein interner Fehler ist aufgetreten.' });
        }
    }
};