// Prüft die MQTT-Einrichtung (HiveMQ) mit den Zugangsdaten aus .env – ohne Datenbank.
//
//   node --env-file=.env scripts/check-mqtt.js
//
// Getestet wird: Sortify-Zugang kann senden, Geräte-Zugang kann empfangen,
// und (falls die Rechte getrennt sind) der Geräte-Zugang darf NICHT senden.

import mqtt from 'mqtt';
import crypto from 'crypto';

const env = process.env;
const missing = ['MQTT_HOST', 'MQTT_SERVER_USERNAME', 'MQTT_SERVER_PASSWORD', 'MQTT_DEVICE_USERNAME', 'MQTT_DEVICE_PASSWORD'].filter((k) => !env[k]);
if (missing.length) {
    console.error(`❌ Fehlt in .env: ${missing.join(', ')}`);
    process.exit(1);
}
const tls = env.MQTT_TLS !== 'false';
const url = `${tls ? 'mqtts' : 'mqtt'}://${env.MQTT_HOST}:${Number(env.MQTT_PORT) || (tls ? 8883 : 1883)}`;
const prefix = env.MQTT_TOPIC_PREFIX || 'sortify';
const topic = `${prefix}/d/check-${crypto.randomBytes(4).toString('hex')}/cmd`;

const connect = (username, password, label) =>
    mqtt.connectAsync(url, { username, password, clientId: `sortify-check-${label}-${crypto.randomBytes(3).toString('hex')}`, connectTimeout: 8000, reconnectPeriod: 0 })
        .then((c) => { console.log(`✅ Anmeldung ${label} (${username}) erfolgreich`); return c; })
        .catch((e) => { console.error(`❌ Anmeldung ${label} (${username}) fehlgeschlagen: ${e.message}`); process.exit(1); });

console.log(`Broker: ${url}\n`);
const device = await connect(env.MQTT_DEVICE_USERNAME, env.MQTT_DEVICE_PASSWORD, 'Gerät');
const server = await connect(env.MQTT_SERVER_USERNAME, env.MQTT_SERVER_PASSWORD, 'Sortify');

const received = new Promise((resolve) => {
    device.on('message', (t, payload) => { if (t === topic) resolve(payload.toString()); });
    setTimeout(() => resolve(null), 8000);
});
await device.subscribeAsync(topic, { qos: 1 });
await server.publishAsync(topic, 'hallo-terminal', { qos: 1 });
const message = await received;
console.log(message === 'hallo-terminal' ? '✅ Sortify sendet, Gerät empfängt' : '❌ Gerät hat die Testnachricht nicht empfangen (Rechte "Subscribe" für den Geräte-Zugang prüfen)');

// Darf der Geräte-Zugang senden? (sollte er nicht)
const echo = new Promise((resolve) => {
    device.on('message', (t, payload) => { if (payload.toString() === 'darf-nicht') resolve(true); });
    setTimeout(() => resolve(false), 4000);
});
// Ein Broker mit getrennten Rechten lehnt ab oder trennt das Gerät – dann kommt nie eine Bestätigung
device.publishAsync(topic, 'darf-nicht', { qos: 1 }).catch(() => {});
console.log(await echo
    ? '⚠️  Der Geräte-Zugang darf auch senden. Sicher bleibt es trotzdem (Nachrichten sind signiert), besser ist aber nur "Subscribe".'
    : '✅ Geräte-Zugang darf nicht senden');

server.end(true); device.end(true);
process.exit(message === 'hallo-terminal' ? 0 : 1);
