import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';

export async function GET({ params, locals }) {
    // 1. Türsteher: Ist der User eingeloggt und hat ein aktives Lager?
    const systemId = locals.systemId;
    if (!systemId) {
        return json({ error: 'Nicht autorisiert' }, { status: 401 });
    }

    try {
        const request = await db.getScaleRequest(params.id);
        
        if (!request) {
            return json({ error: 'Request not found' }, { status: 404 });
        }

        // 2. Mandanten-Prüfung: Gehört diese Waagen-Anfrage WIRKLICH zu diesem Lager?
        if (request.systemId.toString() !== systemId.toString()) {
            return json({ error: 'Zugriff verweigert' }, { status: 403 });
        }

        return json(request);
    } catch (error) {
        console.error("Fehler beim Abrufen des Waagen-Status:", error);
        return json({ error: 'Database error' }, { status: 500 });
    }
}