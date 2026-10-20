import dbModule from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';

// Stand einer Kopplung für die Web-Oberfläche – nur für das Lager, das den Code eingegeben hat
export async function GET({ url, locals }) {
    const pairingId = url.searchParams.get('id');
    if (!pairingId || !ObjectId.isValid(pairingId)) return json({ error: 'Ungültige ID' }, { status: 400 });

    const db = await dbModule.getDb();
    const device = await db.collection('device_pairings').findOne({ _id: new ObjectId(pairingId) });
    const ownSystem = device && (!device.claimedBySystemId || device.claimedBySystemId === String(locals.systemId));
    const expired = device?.expiresAt && device.expiresAt < new Date();

    if (!device || !ownSystem || expired) return json({ status: 'not_found' });
    return json({ status: device.status });
}
