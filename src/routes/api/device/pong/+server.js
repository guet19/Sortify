import { json } from '@sveltejs/kit';
import { deviceFromRequest } from '$lib/server/devices.js';
import { deviceError } from '$lib/server/deviceApi.js';

// Antwort des Terminals auf einen Verbindungstest ("ping" per MQTT): "zuletzt gesehen" sofort speichern
export async function POST({ request }) {
    const device = await deviceFromRequest(request, { force: true });
    if (!device) return deviceError(401, 'Terminal ist nicht (mehr) gekoppelt.');
    return json({ ok: true });
}
