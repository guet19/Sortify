import { fail, redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { listTerminals } from '$lib/server/devices.js';
import { cancelLedsOff } from '$lib/server/leds.js';
import { versionAtLeast, WAVE_MIN_VERSION, WAVE_STEP_MS } from '$lib/server/deviceProtocol.js';
import { allDrawerLeds } from '$lib/terminals.js';
import { barcodeUsage, cleanBarcode } from '$lib/barcodeCheck.js';
import { listLabels, addLabel, forgetLabel, clearLabels } from '$lib/server/labelBuffer.js';
import { actor } from '$lib/server/actor.js';

const BLUE = '#0000FF';
const NO_DRAWERS = 'Keine angelernten Fächer gefunden.';
const canWave = (terminal) => versionAtLeast(terminal?.softwareVersion, WAVE_MIN_VERSION);
const drawerCount = (groups) => groups.reduce((n, g) => n + g.leds.length, 0);

// LEDs der gewählten Regale pro Terminal (ohne Auswahl: alle Regale)
async function ledGroups(systemId, data) {
    const shelfId = data.get('shelfId')?.toString();
    const [shelves, terminals] = await Promise.all([db.getShelves(systemId), listTerminals(systemId)]);
    const chosen = shelfId ? shelves.filter((s) => s._id === shelfId) : shelves;
    return { groups: allDrawerLeds(chosen, terminals), terminals };
}

async function usageOf(systemId, barcode) {
    const [shelves, articles] = await Promise.all([db.getShelves(systemId), db.getArticlesWithBarcode(systemId, barcode)]);
    return barcodeUsage(barcode, shelves, articles);
}

export async function load({ locals }) {
    const systemId = locals.systemId;
    if (!systemId) throw redirect(303, '/login');

    const [shelves, terminals, labels] = await Promise.all([db.getShelves(systemId), listTerminals(systemId), listLabels(systemId)]);
    return {
        labels,
        shelves: shelves.map((s) => ({ id: s._id, name: s.name || 'Regal', drawers: (s.drawers || []).length })),
        waveReady: terminals.some(canWave),
        waveOutdated: terminals.filter((t) => !canWave(t)).map((t) => t.name),
        waveMinVersion: WAVE_MIN_VERSION
    };
}

export const actions = {
    checkBarcode: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { error: 'Kein Lager ausgewählt' });

        const barcode = cleanBarcode((await request.formData()).get('barcode'));
        if (!barcode) return fail(400, { error: 'Bitte einen Barcode scannen oder eingeben.' });

        try {
            // Jedes geprüfte Etikett kommt in den Zwischenspeicher; doppelte Codes zeigt die Seite an
            const usage = await usageOf(systemId, barcode);
            const labelId = await addLabel(systemId, { code: usage.barcode, free: usage.free, by: actor(locals, 'service').userName });
            return { success: true, usage, labelId, labels: await listLabels(systemId) };
        } catch (err) {
            console.error('Fehler bei der Barcode-Prüfung:', err);
            return fail(500, { error: 'Die Prüfung ist fehlgeschlagen. Der Barcode gilt damit nicht als frei.' });
        }
    },

    // Einen Eintrag aus dem Zwischenspeicher entfernen (z.B. dasselbe Etikett versehentlich zweimal gescannt)
    forgetLabel: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { error: 'Kein Lager ausgewählt' });

        try {
            const removed = await forgetLabel(systemId, (await request.formData()).get('id'));
            if (!removed) return fail(404, { error: 'Eintrag nicht gefunden.', labels: await listLabels(systemId) });
            return { success: true, labels: await listLabels(systemId) };
        } catch (err) {
            console.error('Fehler beim Entfernen aus dem Zwischenspeicher:', err);
            return fail(500, { error: 'Der Eintrag konnte nicht entfernt werden.' });
        }
    },

    clearLabels: async ({ locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { error: 'Kein Lager ausgewählt' });

        try {
            await clearLabels(systemId);
            return { success: true, labels: [] };
        } catch (err) {
            console.error('Fehler beim Leeren des Zwischenspeichers:', err);
            return fail(500, { error: 'Der Zwischenspeicher konnte nicht geleert werden.' });
        }
    },

    // Fach eines bereits vergebenen Barcodes aufleuchten lassen
    showDrawer: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { error: 'Kein Lager ausgewählt' });

        const barcode = cleanBarcode((await request.formData()).get('barcode'));
        try {
            const { drawers } = await usageOf(systemId, barcode);
            const shown = await db.triggerLedsByBarcodeArray(systemId, drawers.map((d) => d.barcode), locals.color || BLUE);
            if (!shown) return fail(404, { error: 'Dieses Fach hat keine LED.' });
            return { success: true };
        } catch (err) {
            console.error('Fehler beim Anzeigen des Fachs:', err);
            return fail(500, { error: 'Das Fach konnte nicht angezeigt werden.' });
        }
    },

    // Lauflicht: Ein Befehl pro Terminal, die Schritte taktet das Terminal selbst
    wave: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { error: 'Kein Lager ausgewählt' });

        try {
            const { groups, terminals } = await ledGroups(systemId, await request.formData());
            if (groups.length === 0) return fail(400, { error: NO_DRAWERS });

            const terminalOf = (group) => terminals.find((t) => t.id === group.terminalId);
            const ready = groups.filter((g) => canWave(terminalOf(g)));
            if (ready.length === 0) return fail(409, { error: `Das Lauflicht braucht die Terminal-Software ab Version ${WAVE_MIN_VERSION}.` });

            cancelLedsOff(systemId);
            await db.sendLedGroups(systemId, ready, { color: BLUE, mode: 'wave', stepMs: WAVE_STEP_MS });

            const seconds = Math.ceil((Math.max(...ready.map((g) => g.leds.length)) * WAVE_STEP_MS) / 1000);
            const skipped = groups.filter((g) => !ready.includes(g)).map((g) => terminalOf(g)?.name || 'Terminal');
            return {
                success: true,
                message: `Lauflicht gesendet: ${drawerCount(ready)} Fächer, dauert etwa ${seconds} Sekunden.`
                    + (skipped.length ? ` Nicht dabei wegen alter Software: ${skipped.join(', ')}.` : '')
            };
        } catch (err) {
            console.error('Fehler beim Lauflicht:', err);
            return fail(500, { error: 'Das Lauflicht konnte nicht gestartet werden.' });
        }
    },

    allBlue: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { error: 'Kein Lager ausgewählt' });

        try {
            const { groups } = await ledGroups(systemId, await request.formData());
            if (groups.length === 0) return fail(400, { error: NO_DRAWERS });

            cancelLedsOff(systemId);
            await db.sendLedGroups(systemId, groups, { color: BLUE, mode: 'solid' });
            return { success: true, message: `Gesendet: ${drawerCount(groups)} Fächer leuchten blau, höchstens 60 Sekunden lang.` };
        } catch (err) {
            console.error('Fehler beim Einschalten aller Fächer:', err);
            return fail(500, { error: 'Die Fächer konnten nicht eingeschaltet werden.' });
        }
    },

    // Beendet auch ein laufendes Lauflicht
    allOff: async ({ locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { error: 'Kein Lager ausgewählt' });

        try {
            cancelLedsOff(systemId);
            await db.createHardwareCommand(systemId, [0]);
            return { success: true, message: 'Alle LEDs ausgeschaltet.' };
        } catch (err) {
            console.error('Fehler beim Ausschalten der LEDs:', err);
            return fail(500, { error: 'Die LEDs konnten nicht ausgeschaltet werden.' });
        }
    }
};
