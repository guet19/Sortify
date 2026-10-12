import db from '$lib/server/db.js';

// Ein Abschalt-Timer PRO LAGER. Vorher teilten sich alle Lager eine globale Variable,
// sodass ein Lager den Timer eines anderen abbrechen konnte.
// Hinweis: In Serverless-Umgebungen ist ein Timer nach der Antwort nicht garantiert.
// Zuverlässig wäre eine Leuchtdauer im Hardware-Befehl, die der Pi selbst auswertet.
const ledOffTimers = new Map();

export function cancelLedsOff(systemId) {
    const key = String(systemId);
    const timer = ledOffTimers.get(key);
    if (timer) {
        clearTimeout(timer);
        ledOffTimers.delete(key);
    }
}

export function scheduleLedsOff(systemId, delayMs) {
    cancelLedsOff(systemId);
    const key = String(systemId);
    ledOffTimers.set(key, setTimeout(async () => {
        ledOffTimers.delete(key);
        try { await db.createHardwareCommand(systemId, [0]); } catch (e) {}
    }, delayMs));
}

