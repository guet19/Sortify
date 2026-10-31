// Mehrere Terminals pro Lager (z.B. eines pro Regalwand). Jedes Terminal hat einen eigenen
// LED-Streifen und eine eigene Waage. Welches Terminal bekommt welchen Befehl?
//   LEDs:  das Terminal des Regals (Regal ohne Zuordnung -> das zuerst gekoppelte Terminal)
//   Waage: das Terminal, an dem dieser Browser steht (einmal gewählt, als Cookie gespeichert)
// terminals: [{ id, … }] sortiert nach Kopplungszeitpunkt (das erste ist das Standard-Terminal)

export const TERMINAL_COOKIE = 'sortify_terminal';
export const MAX_TERMINALS = 10;
export const MAX_TERMINAL_NAME = 40;

export function defaultTerminalId(terminals) {
    return terminals[0]?.id ?? null;
}

export function shelfTerminalId(shelf, terminals) {
    const own = shelf?.deviceId ? String(shelf.deviceId) : null;
    return own && terminals.some((t) => t.id === own) ? own : defaultTerminalId(terminals);
}

// LED-Nummern (1-basiert, wie sie das Terminal erwartet) der Fächer mit diesen Barcodes, pro Terminal.
// Ohne gekoppelte Terminals (alte Terminals mit Datenbankzugriff) gibt es eine Gruppe mit terminalId null.
export function ledTargets(shelves, barcodes, terminals) {
    const wanted = new Set(barcodes);
    const groups = new Map();
    for (const shelf of shelves) {
        const terminalId = shelfTerminalId(shelf, terminals);
        for (const drawer of shelf.drawers || []) {
            if (!wanted.has(drawer.barcode)) continue;
            const led = parseInt(drawer.ledIndex, 10) + 1;
            if (!Number.isFinite(led)) continue;
            if (!groups.has(terminalId)) groups.set(terminalId, []);
            groups.get(terminalId).push(led);
        }
    }
    return [...groups.entries()].map(([terminalId, leds]) => ({ terminalId, leds }));
}

// Terminal für Waage und Kalibrierung: das gewählte Terminal dieses Browsers, sonst das einzige,
// sonst (wenn es um ein Fach geht) das Terminal seines Regals. null = nicht eindeutig -> nachfragen
export function scaleTerminalId(terminals, { selectedId = null, shelf = null } = {}) {
    if (selectedId && terminals.some((t) => t.id === selectedId)) return selectedId;
    if (terminals.length <= 1) return defaultTerminalId(terminals);
    return shelf ? shelfTerminalId(shelf, terminals) : null;
}

// Nächste freie LED am Streifen eines Terminals (Regale werden hintereinander angeschlossen).
// Zählt auch die LED-Nummern der Fächer, falls die Fächeranzahl eines Regals fehlt oder nicht stimmt.
export function nextFreeLed(shelves, terminalId, terminals) {
    let next = 0;
    for (const shelf of shelves) {
        if (shelfTerminalId(shelf, terminals) !== terminalId) continue;
        next = Math.max(next, (parseInt(shelf.start_index, 10) || 0) + (parseInt(shelf.drawer_count, 10) || 0));
        for (const drawer of shelf.drawers || []) {
            const led = parseInt(drawer.ledIndex, 10);
            if (Number.isFinite(led)) next = Math.max(next, led + 1);
        }
    }
    return next;
}

export function cleanTerminalName(name) {
    return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TERMINAL_NAME);
}

// Name für ein neu gekoppeltes Terminal: "Terminal 1", "Terminal 2", … (der erste freie)
export function nextTerminalName(existingNames) {
    const taken = new Set(existingNames.map((n) => String(n).trim().toLowerCase()));
    let n = 1;
    while (taken.has(`terminal ${n}`)) n++;
    return `Terminal ${n}`;
}
