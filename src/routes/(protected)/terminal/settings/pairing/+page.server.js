import dbModule from '$lib/server/db';
import { fail } from '@sveltejs/kit';
import { ObjectId } from 'mongodb'; 

// 🔥 FIX: Holt zuverlässig das AKTIVE System (die 9), in dem sich der User gerade befindet!
function getActiveSystemId(locals) {
    // Prio 1: Die aktive ID, die wir auch beim Kalibrieren nutzen (das ist die korrekte 9!)
    if (locals.systemId) {
        return locals.systemId.toString();
    }
    // Prio 2: Fallback, falls middleware nicht griff
    if (locals.user && locals.user.systems && locals.user.systems.length > 0) {
        return locals.user.systems[0].systemId.toString();
    }
    throw new Error("Konnte keine aktive System-ID ermitteln.");
}

export const load = async ({ locals }) => {
    const systemId = getActiveSystemId(locals);
    const db = await dbModule.getDb();
    const pairings = db.collection('device_pairings');

    const activeDevice = await pairings.findOne({
        systemId: systemId,
        status: 'paired'
    });

    return {
        isPaired: !!activeDevice 
    };
};

export const actions = {
    verifyCode1: async ({ request, locals }) => {
        const data = await request.formData();
        const code1 = data.get('code1')?.toString().toUpperCase();

        if (!code1) return fail(400, { error: 'Bitte Code eingeben', step: 1 });

        const systemId = getActiveSystemId(locals);
        const db = await dbModule.getDb();
        const pairings = db.collection('device_pairings');

        const alreadyPaired = await pairings.findOne({ systemId: systemId, status: 'paired' });
        if (alreadyPaired) {
            return fail(400, { error: 'Es ist bereits ein Terminal mit diesem System verbunden.', step: 1 });
        }
        
        const device = await pairings.findOne({ 
            code1: code1, 
            status: 'waiting_for_web' 
        });

        if (!device) {
            return fail(400, { error: 'Ungültiger oder abgelaufener Code.', step: 1 });
        }

        await pairings.updateOne(
            { _id: device._id },
            { $set: { status: 'user_claimed' } }
        );

        return { success: true, step: 2, pairingId: device._id.toString() };
    },

    verifyCode2: async ({ request, locals }) => {
        const data = await request.formData();
        const code2 = data.get('code2')?.toString().toUpperCase();
        const pairingId = data.get('pairingId');

        if (!code2) return fail(400, { error: 'Bitte Code 2 eingeben', step: 2, pairingId });

        const db = await dbModule.getDb();
        const pairings = db.collection('device_pairings');
        
        let objectId;
        try {
            objectId = new ObjectId(pairingId);
        } catch (e) {
            return fail(400, { error: 'Ungültige Terminal-ID.', step: 1 });
        }

        const device = await pairings.findOne({ _id: objectId });

        if (!device || device.status === 'waiting_for_web' || device.status === 'cancelled') {
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

        // 🔥 FIX: Speichert das Terminal endlich unter der aktiven ID (Endung 9)!
        const systemId = getActiveSystemId(locals); 

        await pairings.updateOne(
            { _id: device._id },
            { $set: { status: 'paired', systemId: systemId } }
        );

        return { success: true, step: 3, message: 'Terminal erfolgreich gekoppelt!' };
    },

    removeTerminal: async ({ locals }) => {
        const systemId = getActiveSystemId(locals);
        const db = await dbModule.getDb();
        const pairings = db.collection('device_pairings');

        await pairings.deleteMany({
            systemId: systemId,
            status: 'paired'
        });

        return { success: true };
    }
};