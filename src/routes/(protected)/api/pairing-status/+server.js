import dbModule from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';

export async function GET({ url }) {
    const pairingId = url.searchParams.get('id');
    if (!pairingId) return json({ error: 'Keine ID übergeben' }, { status: 400 });

    try {
        const db = await dbModule.getDb();
        const pairings = db.collection('device_pairings');
        
        const device = await pairings.findOne({ _id: new ObjectId(pairingId) });

        if (!device) {
            return json({ status: 'not_found' });
        }
        
        return json({ status: device.status });
    } catch (e) {
        return json({ error: 'Ungültige ID' }, { status: 400 });
    }
}