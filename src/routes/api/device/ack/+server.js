import { json } from '@sveltejs/kit';
import { acknowledgeCommand, deviceFromRequest } from '$lib/server/devices.js';
import { deviceError, readJson } from '$lib/server/deviceApi.js';

// Rückmeldung des Terminals zu einem Waagen- oder Kalibrier-Auftrag (z.B. gemessenes Gewicht)
export async function POST({ request }) {
    const device = await deviceFromRequest(request);
    if (!device) return deviceError(401, 'Terminal ist nicht (mehr) gekoppelt.');
    const ok = await acknowledgeCommand(device, await readJson(request));
    return ok ? json({ ok: true }) : deviceError(404, 'Auftrag nicht gefunden oder bereits erledigt.');
}
