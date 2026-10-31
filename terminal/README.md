# Sortify Terminal – Bauanleitung

Das Terminal ist ein Raspberry Pi mit Touch-Display, Waage und LED-Streifen. Es zeigt dir im Regal, wo ein Artikel liegt (Pick-by-Light), und zählt den Bestand über das Gewicht. Du baust es selbst und verbindest es danach mit deinem Lager auf Sortify.

## So funktioniert die Verbindung

- Das Terminal hat **keine Zugangsdaten zur Datenbank**. Beim Koppeln bekommt es ein eigenes Geräte-Token und einen eigenen Schlüssel.
- Befehle wie „Fach 12 leuchten lassen“ oder „bitte wiegen“ kommen über einen MQTT-Broker. Jede Nachricht ist mit dem Schlüssel deines Terminals verschlüsselt und signiert (AES-256-GCM). Andere Terminals können sie weder lesen noch fälschen.
- Antworten wie das gemessene Gewicht schickt das Terminal per HTTPS an Sortify.
- Ein Terminal sieht nur die Befehle seines eigenen Lagers. Wird es in Sortify getrennt, verliert es sofort den Zugriff.

## Teileliste

| Teil | Hinweis |
|---|---|
| Raspberry Pi 3 oder 4 mit WLAN | Raspberry Pi OS (64 Bit), mit Internetzugang |
| 2,8"-Display ILI9341 (SPI) mit Touch-Controller XPT2046 | 320 × 240 Pixel |
| LED-Streifen WS2812B | bis 500 LEDs, eine LED pro Fach |
| 5-V-Netzteil für den LED-Streifen | ausreichend stark (bis 60 mA pro LED bei voller Helligkeit) |
| Wägezelle mit HX711-Verstärker | z.B. 5 kg |
| Taster mit LED | optional, die Beleuchtung hängt an GPIO 14 |

Der Raspberry Pi 5 braucht für den LED-Streifen eine andere Bibliothek und wird von diesem Code noch nicht unterstützt.

## Verkabelung (BCM-Nummern)

| Bauteil | Anschluss | GPIO |
|---|---|---|
| Display | MOSI / MISO / SCLK | 10 / 9 / 11 (SPI0) |
| Display | CS | 8 (CE0) |
| Display | DC / Reset | 24 / 25 |
| Touch | CS | 7 (CE1) |
| Touch | IRQ | 17 |
| LED-Streifen | Daten (DIN) | 18 |
| HX711 | DOUT / SCK | 5 / 6 |
| Taster-Beleuchtung | + | 14 |

Masse (GND) von LED-Netzteil und Raspberry Pi verbinden. Die Pins kannst du oben in `sortify_terminal.py` (Abschnitt „Einstellungen“) anpassen, ebenso die Anzahl LEDs (`NUM_PIXELS`).

## Installation

1. Raspberry Pi OS installieren, WLAN einrichten und **SPI aktivieren**: `sudo raspi-config` → *Interface Options* → *SPI*.
2. Pakete installieren:
   ```bash
   sudo apt update
   sudo apt install -y git python3-venv python3-dev fonts-dejavu
   ```
3. Code holen und Python-Umgebung einrichten:
   ```bash
   sudo git clone https://github.com/guet19/Sortify.git /opt/sortify-src
   sudo mkdir -p /opt/sortify-terminal
   sudo cp /opt/sortify-src/terminal/* /opt/sortify-terminal/
   cd /opt/sortify-terminal
   sudo python3 -m venv venv
   sudo venv/bin/pip install -r requirements.txt
   ```
4. Testlauf (beenden mit Strg+C):
   ```bash
   sudo venv/bin/python sortify_terminal.py
   ```
5. Automatisch starten:
   ```bash
   sudo cp sortify-terminal.service /etc/systemd/system/
   sudo systemctl enable --now sortify-terminal
   journalctl -u sortify-terminal -f    # Protokoll ansehen
   ```

## Koppeln

1. Terminal einschalten. Auf dem Display erscheint ein weisser, 8-stelliger Code.
2. In Sortify anmelden → **Terminal → Einstellungen → Terminal koppeln** und den Code eingeben.
3. Am Terminal auf **Erlauben** tippen. Es erscheint ein grüner Code.
4. Den grünen Code in Sortify eingeben. Fertig, das Terminal zeigt „Bereit“ und den Namen deines Lagers.
5. Danach in Sortify die **Waage kalibrieren** (Tara und ein bekanntes Gewicht).

Die Zugangsdaten liegen in `terminal_config.json` (nur für root lesbar). Wer diese Datei hat, kann sich als dein Terminal ausgeben. Gib sie deshalb nicht weiter. Bei Verlust trennst du das Terminal in Sortify, dann wird die Datei wertlos.

## Mehrere Terminals pro Lager

Ein Lager kann bis zu 10 Terminals haben, z.B. eines pro Regalwand. Jedes Terminal hat einen eigenen LED-Streifen und eine eigene Waage.

1. Jedes weitere Terminal wie oben koppeln (**Terminal koppeln → Weiteres Terminal koppeln**). Es heisst zuerst „Terminal 2“, „Terminal 3“ usw. Den Namen kannst du dort ändern, z.B. „Regalwand Nord“. Bei mehreren Terminals zeigt das Display unter „Bereit“ auch den Namen des Terminals. **Erkennen** lässt die ersten LEDs eines Terminals kurz weiss blinken.
2. Unter **Fächer anlernen** gehört jedes Regal zu einem Terminal: beim Anlernen wählen oder später im aufgeklappten Regal ändern. Die LED-Nummern zählen pro Terminal ab 0. Regale ohne Zuordnung (z.B. aus der Zeit mit nur einem Terminal) gehören zum zuerst gekoppelten Terminal.
3. Jeder Browser, mit dem du am Terminal arbeitest (Tablet, PC), fragt einmal: „An welchem Terminal stehst du?“ Wiegen und Kalibrieren laufen über dieses Terminal. Die Wahl lässt sich oben über den Terminal-Namen ändern.

LED-Befehle (z.B. „Fächer aufleuchten lassen“) gehen automatisch an das Terminal, an dessen Streifen das jeweilige Regal hängt.

## Waage: so misst das Terminal

Ab Version 2.3.0:

- **Erst messen, wenn die Waage ruhig ist.** Nach dem Abstellen schwingt eine Kiste kurz nach. Das Terminal liest laufend und wartet, bis 24 Messwerte in Folge ruhig sind (bei üblichen HX711-Platinen 2,4 s). Gemittelt werden die letzten zwei Drittel davon. Einzelne Störimpulse werden übersprungen. Wird die Waage nach 8 s nicht ruhig (z.B. weil jemand sie berührt), antwortet das Terminal trotzdem und meldet das Ergebnis als „unruhig“.
- **Nullpunkt-Nachführung.** Wägezellen driften nach dem Einschalten und mit der Temperatur. Ist die Waage leer und ruhig, zieht das Terminal den Nullpunkt alle 2 Sekunden sanft nach. Liegt etwas auf der Waage (mehr als 3 g), bleibt der Nullpunkt unverändert.
- **Kalibrieren nur bei ruhiger Waage.** Ist sie unruhig, meldet Sortify das, statt einen falschen Wert zu speichern.
- Die Live-Anzeige der Waage misst weiterhin sofort.

Feineinstellung in `terminal_config.json` (optional, danach das Terminal neu starten):

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `stable_samples` | 24 | Ruhige Messwerte pro Wiegung. Weniger ist schneller, mehr ist genauer (für sehr kleine Teile). |
| `stable_tolerance_g` | 0.5 | Erlaubte Schwankung in Gramm. Bei stark rauschenden Waagen erhöht das Terminal sie selbst (4× das beim Tarieren gemessene Rauschen). |
| `zero_track_range_g` | 3.0 | Bis zu dieser Abweichung gilt die Waage als „leer“ und der Nullpunkt wird nachgeführt. |

Die Waage braucht die Python-Bibliothek `hx711` von Marco Roose (in `requirements.txt` festgelegt). Prüfen mit `venv/bin/pip show hx711`: Dort sollte „Author: Marco Roose“ stehen.

## Fehlerbehebung

| Anzeige | Bedeutung |
|---|---|
| **Offline** | Sortify ist nicht erreichbar. WLAN prüfen; das Terminal versucht es automatisch erneut. |
| **Nicht bereit** | Auf dem Sortify-Server ist kein MQTT-Broker eingerichtet (Betreiber kontaktieren). |
| **Getrennt** | Das Terminal wurde in Sortify entfernt und zeigt gleich einen neuen Code. |
| **Waage leer?** | Beim Start liegt etwas auf der Waage. Abräumen und bestätigen. |

Reagiert das Terminal nicht auf Befehle, prüfe die Uhrzeit des Pi (`timedatectl`). Befehle, die älter als 2 Minuten sind, werden aus Sicherheitsgründen verworfen. Das Terminal gleicht kleinere Abweichungen über die Serverzeit selbst aus.

---

## Für Betreiber einer Sortify-Instanz

Diese Schritte sind nur einmal nötig, wenn du Sortify selbst hostest.

### MQTT-Broker einrichten

Sortify funktioniert mit jedem MQTT-Broker, der TLS und Benutzername/Passwort unterstützt. Zwei bewährte Wege:

- **EMQX Serverless:** Das monatliche Gratiskontingent von 1 Mio. Sitzungsminuten reicht für etwa 20 dauerhaft verbundene Terminals, danach kostet es nutzungsabhängig.
- **Eigener Mosquitto-Server:** Auf einem kleinen VPS ist er für beliebig viele Terminals geeignet.

HiveMQ Cloud Serverless wird eingestellt und taugt nicht mehr.

1. Auf [emqx.com](https://www.emqx.com/en/cloud/serverless-mqtt) ein **Serverless**-Deployment anlegen (Region Europa). Adresse und TLS-Port (8883) stehen in der Übersicht.
2. Unter *Access Control → Authentication* zwei Zugänge anlegen: `sortify-server` und `sortify-device`.
3. Unter *Access Control → Authorization* Regeln setzen:
   - `sortify-server`: **Publish** auf `sortify/d/#` erlauben
   - `sortify-device`: **Subscribe** auf `sortify/d/+/cmd` erlauben
   - alles andere für beide verbieten

   Ohne getrennte Rechte bleibt die Verbindung trotzdem sicher, weil alle Nachrichten verschlüsselt und signiert sind. Ein Gerät könnte dann aber unsinnige Nachrichten senden, die von den Terminals verworfen werden.
4. In Netlify unter *Site settings → Environment variables* eintragen (Vorlage: `.env.example`):
   `MQTT_HOST`, `MQTT_PORT` (8883), `MQTT_SERVER_USERNAME`, `MQTT_SERVER_PASSWORD`, `MQTT_DEVICE_USERNAME`, `MQTT_DEVICE_PASSWORD`.
5. Die gleichen Werte lokal in `.env` eintragen und prüfen: `npm run mqtt:check`
6. Das Index-Skript erneut ausführen (`scripts/create-indexes.mongosh.js`), damit die Collection `devices` ihre Indizes bekommt.
7. Wer eine eigene Instanz betreibt, trägt deren Adresse in `sortify_terminal.py` als `DEFAULT_SERVER_URL` ein (Standard: `https://sortify-storage.netlify.app`).

### Lokal testen

Mit einem eigenen Broker ohne TLS, z.B. Mosquitto: `MQTT_HOST=localhost`, `MQTT_PORT=1883`, `MQTT_TLS=false`. Das Terminal startest du mit `SORTIFY_URL=http://<dein-rechner>:5173`.

### Ältere Terminals

Terminals mit dem alten Code (direkter Datenbankzugriff) funktionieren übergangsweise weiter, solange sie noch Zugangsdaten zur Datenbank haben. Sobald alle Terminals umgestellt sind, das Datenbank-Passwort ändern.
