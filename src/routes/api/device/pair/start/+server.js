import { json } from '@sveltejs/kit';
import { startPairing } from '$lib/server/devices.js';
import { limitByIp } from '$lib/server/deviceApi.js';

// Ein ungekoppeltes Terminal fordert einen Kopplungs-Code an
export async function POST({ getClientAddress }) {
    const limited = await limitByIp(getClientAddress, 'pair-start', 20, 60 * 60 * 1000);
    if (limited) return limited;
    return json(await startPairing());
}
