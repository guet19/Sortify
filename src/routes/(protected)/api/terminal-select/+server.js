import { json } from '@sveltejs/kit';
import { rememberTerminal } from '$lib/server/devices.js';

// Mehrere Terminals pro Lager: merkt sich (Cookie), an welchem Terminal dieser Browser steht.
// Waage und Kalibrierung gehen danach an dieses Terminal.
export async function POST({ request, locals, cookies }) {
    if (!locals.systemId) return json({ error: 'Kein aktives Lager ausgewählt' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const ok = await rememberTerminal(cookies, locals.systemId, String(body.terminalId || ''));
    return ok ? json({ ok: true }) : json({ error: 'Terminal nicht gefunden.' }, { status: 404 });
}
