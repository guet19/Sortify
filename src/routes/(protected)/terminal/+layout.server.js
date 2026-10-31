import { listTerminals, selectedTerminalId } from '$lib/server/devices.js';

// Mehrere Terminals pro Lager: Welche gibt es, und an welchem steht dieser Browser?
// (bei genau einem Terminal ist es automatisch dieses)
export async function load({ locals, cookies }) {
    if (!locals.systemId) return { terminals: [], currentTerminalId: null };
    const terminals = (await listTerminals(locals.systemId).catch(() => [])).map((t) => ({ id: t.id, name: t.name }));
    const selected = selectedTerminalId(cookies);
    const current = terminals.find((t) => t.id === selected) || (terminals.length === 1 ? terminals[0] : null);
    return { terminals, currentTerminalId: current?.id || null };
}
