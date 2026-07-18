import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';

export async function POST({ request, locals }) {
    const systemId = locals.systemId;
    if (!systemId) {
        return json({ success: false, error: 'Nicht autorisiert' }, { status: 401 });
    }

    try {
        const body = await request.json();
        
        // Verteiler, je nachdem welcher Button im Frontend geklickt wurde
        if (body.step === 'zero') {
            await db.sendCalibrationCommand(systemId, 'calibrate_zero');
        } else if (body.step === 'ratio') {
            if (!body.weight || body.weight <= 0) throw new Error("Ungültiges Gewicht");
            await db.sendCalibrationCommand(systemId, 'calibrate_ratio', body.weight);
        }
        
        return json({ success: true });
    } catch (error) {
        console.error("🔴 Kalibrierungs-Fehler:", error);
        return json({ success: false, error: error.message }, { status: 504 });
    }
}