import { json } from '@sveltejs/kit';
import { answerPairing } from '$lib/server/devices.js';
import { limitByIp, readJson } from '$lib/server/deviceApi.js';

// Antwort vom Touch-Display: Kopplung erlauben oder ablehnen
export async function POST({ request, getClientAddress }) {
    const limited = await limitByIp(getClientAddress, 'pair-answer', 60, 60 * 60 * 1000);
    if (limited) return limited;
    const { pairingId, secret, accept } = await readJson(request);
    const result = await answerPairing(pairingId, secret, accept === true);
    return json(result, { status: result.status === 'expired' ? 404 : 200 });
}
