import { json } from '@sveltejs/kit';
import { getTerminalStatus } from '$lib/server/devices.js';

// Verbindungsanzeige oben rechts im Terminal: online / checking / offline / unpaired / unknown
// ?fresh=1: beim Neuladen oder Klick sofort echt prüfen (nicht auf eine frühere Meldung verlassen)
export async function GET({ locals, url }) {
    if (!locals.systemId) return json({ state: 'unknown' }, { status: 401 });
    try {
        const fresh = url.searchParams.get('fresh') === '1';
        return json(await getTerminalStatus(locals.systemId, { fresh }), { headers: { 'cache-control': 'no-store' } });
    } catch (error) {
        console.error('Terminal-Status konnte nicht ermittelt werden:', error);
        return json({ state: 'unknown' });
    }
}
