import { json } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import db from '$lib/server/db.js';
import { deviceFromRequest } from '$lib/server/devices.js';
import { deviceError } from '$lib/server/deviceApi.js';
import { deviceBrokerSettings, topicPrefix } from '$lib/server/mqtt.js';

// Start und regelmässiges Lebenszeichen des Terminals: aktuelle Broker-Daten, Lagername, Serverzeit.
// 401 bedeutet: Das Terminal wurde entfernt und muss neu gekoppelt werden.
export async function GET({ request }) {
    const device = await deviceFromRequest(request);
    if (!device) return deviceError(401, 'Terminal ist nicht (mehr) gekoppelt.');

    const database = await db.getDb();
    const system = await database.collection('systems').findOne({ _id: new ObjectId(device.systemId) }, { projection: { name: 1 } });
    return json({
        systemName: system?.name || 'Lager',
        topic: device.topic,
        topicPrefix: topicPrefix(),
        mqtt: deviceBrokerSettings(),
        serverTime: Date.now()
    });
}
