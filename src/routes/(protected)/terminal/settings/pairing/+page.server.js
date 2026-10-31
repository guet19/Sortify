import dbModule from '$lib/server/db';
import { fail } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import { completePairing, listTerminals, removeTerminal, renameTerminal, identifyTerminal, selectedTerminalId } from '$lib/server/devices.js';
import { isMqttConfigured } from '$lib/server/mqtt.js';
import { MAX_TERMINALS, shelfTerminalId } from '$lib/terminals.js';

// Kopplung neuer Terminals: Das Terminal meldet sich über /api/device/pair/* an (viaApi),
// hier bestätigt der Nutzer die beiden Codes. Ein Lager kann mehrere Terminals haben
// (z.B. eines pro Regalwand). Ältere Terminals, die noch direkt mit der Datenbank arbeiten
// (ohne viaApi), werden für den Übergang weiterhin unterstützt – dann aber nur eines.

function getActiveSystemId(locals) {
    if (!locals.systemId) throw new Error('Konnte keine aktive System-ID ermitteln.');
    return locals.systemId.toString();
}

const notExpired = () => ({ $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: { $exists: false } }] });

async function pairingState(pairings, systemId) {
    const [terminals, legacy] = await Promise.all([
        listTerminals(systemId),
        pairings.findOne({ systemId, status: 'paired', viaApi: { $ne: true } })
    ]);
    return { terminals, legacy };
}

export const load = async ({ locals, cookies }) => {
    const systemId = getActiveSystemId(locals);
    const db = await dbModule.getDb();
    const [{ terminals, legacy }, shelves] = await Promise.all([
        pairingState(db.collection('device_pairings'), systemId),
        dbModule.getShelves(systemId)
    ]);

    return {
        // Regale pro Terminal (Regale ohne Zuordnung zählen beim zuerst gekoppelten)
        terminals: terminals.map((t) => ({ ...t, shelves: shelves.filter((s) => shelfTerminalId(s, terminals) === t.id).length })),
        legacy: !!legacy,
        canAddMore: !legacy && terminals.length < MAX_TERMINALS,
        maxTerminals: MAX_TERMINALS,
        browserTerminalId: selectedTerminalId(cookies),
        mqttReady: isMqttConfigured()
    };
};

export const actions = {
    verifyCode1: async ({ request, locals }) => {
        const data = await request.formData();
        const code1 = data.get('code1')?.toString().trim().toUpperCase();
        if (!code1) return fail(400, { error: 'Bitte Code eingeben', step: 1 });

        const systemId = getActiveSystemId(locals);
        const limit = await dbModule.rateLimit(`pairing-code:${locals.user?.id}`, 20, 15 * 60 * 1000);
        if (!limit.allowed) return fail(429, { error: `Zu viele Versuche. Bitte in ${limit.retryAfterMinutes} Minute(n) erneut versuchen.`, step: 1 });

        const db = await dbModule.getDb();
        const pairings = db.collection('device_pairings');

        const { terminals, legacy } = await pairingState(pairings, systemId);
        if (legacy) {
            return fail(400, { error: 'Mit diesem Lager ist noch ein Terminal mit alter Software verbunden. Bitte dieses zuerst trennen und mit der aktuellen Software neu koppeln.', step: 1 });
        }
        if (terminals.length >= MAX_TERMINALS) {
            return fail(400, { error: `Ein Lager kann höchstens ${MAX_TERMINALS} Terminals haben.`, step: 1 });
        }

        // Atomar übernehmen: Ein Code kann nur von einem Lager beansprucht werden
        const device = await pairings.findOneAndUpdate(
            { code1, status: 'waiting_for_web', ...notExpired() },
            { $set: { status: 'user_claimed', claimedBySystemId: systemId } }
        );
        if (!device) return fail(400, { error: 'Ungültiger oder abgelaufener Code.', step: 1 });

        return { success: true, step: 2, pairingId: device._id.toString() };
    },

    verifyCode2: async ({ request, locals }) => {
        const data = await request.formData();
        const code2 = data.get('code2')?.toString().trim().toUpperCase();
        const pairingId = data.get('pairingId')?.toString();

        if (!code2) return fail(400, { error: 'Bitte Code 2 eingeben', step: 2, pairingId });
        if (!pairingId || !ObjectId.isValid(pairingId)) return fail(400, { error: 'Ungültige Terminal-ID.', step: 1 });

        const systemId = getActiveSystemId(locals);
        const limit = await dbModule.rateLimit(`pairing-code2:${pairingId}`, 10, 15 * 60 * 1000);
        if (!limit.allowed) return fail(429, { error: 'Zu viele Fehlversuche. Bitte die Kopplung am Terminal neu starten.', step: 1 });

        const db = await dbModule.getDb();
        const pairings = db.collection('device_pairings');
        const device = await pairings.findOne({ _id: new ObjectId(pairingId), ...notExpired() });

        // Nur das Lager, das Code 1 eingegeben hat, darf die Kopplung abschließen
        const claimedByOther = device?.claimedBySystemId && device.claimedBySystemId !== systemId;
        if (!device || claimedByOther || device.status === 'waiting_for_web' || device.status === 'cancelled') {
            return fail(400, {
                error: 'Zeit abgelaufen (oder am Terminal abgebrochen). Bitte starte den Vorgang mit dem neuen Code auf dem Display von vorne.',
                step: 1
            });
        }
        if (device.status === 'user_claimed') {
            return fail(400, { error: 'Bitte bestätige die Anfrage zuerst auf dem Touch-Display des Terminals.', step: 2, pairingId });
        }
        if (device.code2 !== code2 || device.status !== 'pi_confirmed') {
            return fail(400, { error: 'Falscher Code 2. Bitte erneut versuchen.', step: 2, pairingId });
        }

        let terminalCount = 1;
        if (device.viaApi) {
            await completePairing(device, systemId, locals.user?.id);
            terminalCount = (await listTerminals(systemId)).length;
        } else {
            await pairings.updateOne({ _id: device._id }, { $set: { status: 'paired', systemId } });
        }
        return { success: true, step: 3, message: 'Terminal erfolgreich gekoppelt!', terminalCount };
    },

    renameTerminal: async ({ request, locals }) => {
        const data = await request.formData();
        const result = await renameTerminal(getActiveSystemId(locals), data.get('terminalId')?.toString(), data.get('name')?.toString());
        return result.error ? fail(400, { error: result.error }) : { renamed: true };
    },

    // Kurz die LEDs blinken lassen, um das Gerät im Lager zu finden
    identifyTerminal: async ({ request, locals }) => {
        const data = await request.formData();
        const sent = await identifyTerminal(getActiveSystemId(locals), data.get('terminalId')?.toString());
        return sent ? { identified: data.get('terminalId')?.toString() } : fail(400, { error: 'Das Terminal ist gerade nicht erreichbar.' });
    },

    // Ein Terminal entfernen (terminalId) bzw. das alte Terminal mit Datenbankzugriff (legacy)
    removeTerminal: async ({ request, locals }) => {
        const systemId = getActiveSystemId(locals);
        const data = await request.formData();
        const terminalId = data.get('terminalId')?.toString();
        if (terminalId === 'legacy') {
            const db = await dbModule.getDb();
            await db.collection('device_pairings').deleteMany({ systemId, status: 'paired', viaApi: { $ne: true } });
            return { removed: true };
        }
        return (await removeTerminal(systemId, terminalId)) ? { removed: true } : fail(404, { error: 'Terminal nicht gefunden.' });
    }
};
