import { json } from '@sveltejs/kit';
import { getTerminalStatus, selectedTerminalId } from '$lib/server/devices.js';

// Verbindungsanzeige oben rechts im Terminal: online / checking / offline / unpaired / unknown /
// choose (mehrere Terminals, dieser Browser hat noch keines gewählt)
// ?fresh=1: beim Neuladen oder Klick sofort echt prüfen (nicht auf eine frühere Meldung verlassen)
export async function GET({ locals, url, cookies }) {
    if (!locals.systemId) return json({ state: 'unknown' }, { status: 401 });
    try {
        const fresh = url.searchParams.get('fresh') === '1';
        const status = await getTerminalStatus(locals.systemId, { fresh, selectedId: selectedTerminalId(cookies) });
        return json(status, { headers: { 'cache-control': 'no-store' } });
    } catch (error) {
        console.error('Terminal-Status konnte nicht ermittelt werden:', error);
        return json({ state: 'unknown' });
    }
}
