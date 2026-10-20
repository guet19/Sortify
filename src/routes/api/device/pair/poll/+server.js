import { json } from '@sveltejs/kit';
import { pollPairing } from '$lib/server/devices.js';
import { limitByIp, readJson } from '$lib/server/deviceApi.js';
import { deviceBrokerSettings, topicPrefix } from '$lib/server/mqtt.js';

// Das Terminal fragt alle paar Sekunden nach dem Stand der Kopplung
export async function POST({ request, getClientAddress }) {
    const limited = await limitByIp(getClientAddress, 'pair-poll', 1200, 60 * 60 * 1000);
    if (limited) return limited;
    const { pairingId, secret } = await readJson(request);
    const result = await pollPairing(pairingId, secret);
    if (result.status === 'expired') return json(result, { status: 404 });
    if (result.status === 'paired') {
        return json({ ...result, topicPrefix: topicPrefix(), mqtt: deviceBrokerSettings() });
    }
    return json(result);
}
