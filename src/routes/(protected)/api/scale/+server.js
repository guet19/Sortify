import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';

export async function POST({ locals }) {
    const systemId = locals.systemId;
    if (!systemId) {
        return json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Ruft unsere neue Funktion aus Schritt 1 auf
        const currentWeight = await db.requestScaleWeight(systemId);
        
        return json({ success: true, weight: currentWeight });
    } catch (error) {
        console.error("🔴 API Waagen-Fehler:", error);
        return json({ success: false, error: error.message }, { status: 504 });
    }
}