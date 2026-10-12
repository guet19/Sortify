import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';

// Legt einen Live-Wiege-Auftrag an und antwortet sofort mit dessen ID.
// Das Ergebnis holt der Browser anschließend über GET /api/scale/[id].
export async function POST({ locals }) {
    const systemId = locals.systemId;
    if (!systemId) {
        return json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const requestId = await db.createLiveScaleRequest(systemId);
        return json({ success: true, requestId });
    } catch (error) {
        console.error("🔴 API Waagen-Fehler:", error);
        return json({ success: false, error: 'Waagen-Auftrag konnte nicht erstellt werden.' }, { status: 500 });
    }
}
