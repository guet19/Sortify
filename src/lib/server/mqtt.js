// Verbindung zum MQTT-Broker (z.B. EMQX Serverless oder Mosquitto). Sortify veröffentlicht nur –
// die Terminals abonnieren ihr eigenes Topic. Ohne Konfiguration bleibt MQTT einfach aus.
import mqtt from 'mqtt';
import { env } from '$env/dynamic/private';

export const topicPrefix = () => env.MQTT_TOPIC_PREFIX || 'sortify';

// MQTT_TLS=false nur für einen lokalen Test-Broker (z.B. Mosquitto im eigenen Netz)
const useTls = () => env.MQTT_TLS !== 'false';
const brokerPort = () => Number(env.MQTT_PORT) || (useTls() ? 8883 : 1883);

export function isMqttConfigured() {
    return Boolean(env.MQTT_HOST && env.MQTT_SERVER_USERNAME && env.MQTT_SERVER_PASSWORD);
}

// Zugangsdaten, die ein gekoppeltes Terminal bekommt (beim Broker nur zum Abonnieren berechtigt)
export function deviceBrokerSettings() {
    if (!isMqttConfigured() || !env.MQTT_DEVICE_USERNAME) return null;
    return {
        host: env.MQTT_HOST,
        port: brokerPort(),
        tls: useTls(),
        username: env.MQTT_DEVICE_USERNAME,
        password: env.MQTT_DEVICE_PASSWORD || ''
    };
}

// Eine Verbindung pro Server-Instanz wiederverwenden (warme Serverless-Funktionen sparen den TLS-Aufbau)
let clientPromise = null;

async function getClient() {
    if (clientPromise) {
        const client = await clientPromise.catch(() => null);
        if (client?.connected) return client;
        client?.end(true);
    }
    clientPromise = mqtt.connectAsync(`${useTls() ? 'mqtts' : 'mqtt'}://${env.MQTT_HOST}:${brokerPort()}`, {
        username: env.MQTT_SERVER_USERNAME,
        password: env.MQTT_SERVER_PASSWORD,
        clientId: 'sortify-server-' + Math.random().toString(16).slice(2, 10),
        connectTimeout: 5000,
        reconnectPeriod: 0,
        clean: true
    });
    clientPromise.catch(() => { clientPromise = null; });
    return clientPromise;
}

// QoS 1: Der Broker bestätigt den Empfang. Fehler werden nur gemeldet, nie geworfen –
// ein nicht erreichbarer Broker darf Sortify nicht blockieren.
export async function publish(topic, payload) {
    if (!isMqttConfigured()) return false;
    try {
        const client = await getClient();
        await Promise.race([
            client.publishAsync(topic, payload, { qos: 1 }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('publish timeout')), 5000))
        ]);
        return true;
    } catch (error) {
        console.error('MQTT: Nachricht konnte nicht gesendet werden:', error?.message || error);
        clientPromise = null;
        return false;
    }
}
