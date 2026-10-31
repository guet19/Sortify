import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { scaleTarget } from '$lib/server/devices.js';

export async function POST({ request, locals, cookies }) {
    const systemId = locals.systemId;
    if (!systemId) {
        return json({ success: false, error: 'Nicht autorisiert' }, { status: 401 });
    }

    try {
        const body = await request.json();
        // Kalibriert wird nur die Waage des Terminals, an dem dieser Browser steht
        const target = await scaleTarget(systemId, cookies);
        if (target.error) return json({ success: false, error: target.error, needsTerminal: true }, { status: 409 });
        
        // Verteiler, je nachdem welcher Button im Frontend geklickt wurde
        if (body.step === 'zero') {
            await db.sendCalibrationCommand(systemId, 'calibrate_zero', 0, { deviceId: target.deviceId });
        } else if (body.step === 'ratio') {
            if (!body.weight || body.weight <= 0) throw new Error("Ungültiges Gewicht");
            await db.sendCalibrationCommand(systemId, 'calibrate_ratio', body.weight, { deviceId: target.deviceId });
        }
        
        return json({ success: true });
    } catch (error) {
        console.error("🔴 Kalibrierungs-Fehler:", error);
        return json({ success: false, error: error.message }, { status: 504 });
    }
}