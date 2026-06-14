// src/routes/verify/[token]/+server.js
import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';

export async function GET({ params }) {
    const token = params.token;
    
    // Ruft unsere verify-Funktion auf, diesmal mit isToken = true
    const result = await db.verifyUser(token, true);

    if (result.success) {
        throw redirect(303, '/login?verified=true');
    } else {
        // Bei abgelaufenem Link oder falschem Token
        throw redirect(303, `/login?error=${encodeURIComponent(result.message)}`);
    }
}