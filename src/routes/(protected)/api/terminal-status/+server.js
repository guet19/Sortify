import { json } from '@sveltejs/kit';
import { getTerminalStatus } from '$lib/server/devices.js';

// Verbindungsanzeige oben rechts im Terminal: online / checking / offline / unpaired / unknown
export async function GET({ locals }) {
    if (!locals.systemId) return json({ state: 'unknown' }, { status: 401 });
    try {
        return json(await getTerminalStatus(locals.systemId), { headers: { 'cache-control': 'no-store' } });
    } catch (error) {
        console.error('Terminal-Status konnte nicht ermittelt werden:', error);
        return json({ state: 'unknown' });
    }
}
