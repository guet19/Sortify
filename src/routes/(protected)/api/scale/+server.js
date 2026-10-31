import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { scaleTarget } from '$lib/server/devices.js';

// Legt einen Live-Wiege-Auftrag an und antwortet sofort mit dessen ID.
// Das Ergebnis holt der Browser anschließend über GET /api/scale/[id].
export async function POST({ locals, cookies }) {
    const systemId = locals.systemId;
    if (!systemId) {
        return json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Bei mehreren Terminals: die Waage des Terminals, an dem dieser Browser steht
        const target = await scaleTarget(systemId, cookies);
        if (target.error) return json({ success: false, error: target.error, needsTerminal: true }, { status: 409 });
        const requestId = await db.createLiveScaleRequest(systemId, { deviceId: target.deviceId });
        return json({ success: true, requestId });
    } catch (error) {
        console.error("🔴 API Waagen-Fehler:", error);
        return json({ success: false, error: 'Waagen-Auftrag konnte nicht erstellt werden.' }, { status: 500 });
    }
}
