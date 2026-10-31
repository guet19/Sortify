#!/usr/bin/env python3
"""
Sortify Terminal (Raspberry Pi) – Waage, LED-Regal und Touch-Display.

Das Terminal hat KEINE Datenbank-Zugangsdaten. Es koppelt sich über die Sortify-Webseite
und bekommt dabei ein eigenes Geräte-Token und einen eigenen Schlüssel:
  * Befehle (LEDs, Wiegen, Kalibrieren) kommen verschlüsselt über MQTT (AES-256-GCM).
  * Antworten (z.B. gemessenes Gewicht) gehen per HTTPS an Sortify.

Gegenstück auf dem Server: src/lib/server/deviceProtocol.js und src/routes/api/device/*
Anleitung: terminal/README.md
"""
import base64
import json
import os
import queue
import signal
import sys
import time
import traceback
import uuid
from collections import deque

import requests
import paho.mqtt.client as mqtt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

import board
import digitalio
import adafruit_rgb_display.ili9341 as ili9341
from PIL import Image, ImageDraw, ImageFont
import spidev
import neopixel
import RPi.GPIO as GPIO
from hx711 import HX711

VERSION = "2.3.0"   # 2.1.0: Antwort auf Verbindungstests; 2.1.1: unabhängig von Sprüngen der Systemuhr;
                    # 2.2.0: Name des Terminals (mehrere pro Lager) wird beim Lebenszeichen aktualisiert;
                    # 2.3.0: misst erst, wenn die Waage ruhig ist; Nullpunkt wird im Leerlauf nachgeführt

# ==========================================
# 1. EINSTELLUNGEN
# ==========================================
# Adresse von Sortify – kann mit der Umgebungsvariable SORTIFY_URL überschrieben werden
DEFAULT_SERVER_URL = "https://sortify-storage.netlify.app"
SERVER_URL = os.environ.get("SORTIFY_URL", DEFAULT_SERVER_URL).rstrip("/")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.environ.get("SORTIFY_CONFIG", os.path.join(BASE_DIR, "terminal_config.json"))

NUM_PIXELS = 500           # Anzahl LEDs am Streifen
LED_PIN = board.D18        # Datenleitung LED-Streifen
BUTTON_LED_PIN = 14        # Beleuchtung des Tasters
TOUCH_CS_PIN = 1           # SPI CE1 für den Touch-Controller
TOUCH_IRQ_PIN = 17
HX711_DOUT_PIN = 5
HX711_SCK_PIN = 6

MAX_MESSAGE_AGE_MS = 120_000   # ältere Befehle werden verworfen (Schutz vor Wiederholung)
HEARTBEAT_SECONDS = 15 * 60    # so oft meldet sich das Terminal bei Sortify
LED_TIMEOUT_SECONDS = 60       # LEDs gehen spätestens danach aus
SCREEN_TIMEOUT_SECONDS = 600

# Waage: gemessen wird erst, wenn die Werte ruhig sind (statt nach einer festen Wartezeit)
STABLE_SAMPLES = 24            # so viele ruhige Messwerte in Folge (bei 10 Messungen/s 2,4 s); gemittelt werden
                               # die letzten zwei Drittel, weil die Kiste anfangs noch leicht nachschwingt – terminal_config.json
STABLE_MIN_SECONDS = 0.8       # … und sie müssen mindestens so lange ruhig sein (auch bei schnellen HX711)
STABLE_MIN_SAMPLES = 6         # reicht bei Zeitablauf noch für ein ruhiges Ergebnis
WEIGH_TIMEOUT_SECONDS = 8      # spätestens dann antwortet das Terminal (als "unruhig" gemeldet)
CALIBRATION_TIMEOUT_SECONDS = 6  # Kalibrieren: Sortify wartet höchstens 10 s auf die Antwort
STABLE_TOLERANCE_G = 0.5       # erlaubte Schwankung um den Median (mind.; mehr bei starkem Rauschen) – terminal_config.json
NOISE_FACTOR = 4               # … bzw. so viel Mal das Grundrauschen der leeren Waage
ZERO_TRACK_RANGE_G = 3.0       # Nullpunkt nur nachführen, wenn die Waage (fast) leer ist – terminal_config.json
ZERO_TRACK_EVERY_SECONDS = 2   # so oft prüft das Terminal im Leerlauf den Nullpunkt
ZERO_TRACK_PAUSE_SECONDS = 5   # nach einer Messung kurz warten (die Kiste wird gerade weggenommen)
scale_noise_g = 0.0            # Rauschen der leeren Waage, beim Tarieren gemessen

CALIBRATION_RATIO = 114.0
SCALE_OFFSET = None
config = {}


class Unpaired(Exception):
    """Sortify kennt dieses Terminal nicht (mehr) – neu koppeln."""


def load_config():
    global config, CALIBRATION_RATIO, SCALE_OFFSET, STABLE_SAMPLES, STABLE_TOLERANCE_G, ZERO_TRACK_RANGE_G
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f:
            config = json.load(f)
    CALIBRATION_RATIO = config.get("calibration_ratio", 114.0)
    SCALE_OFFSET = config.get("scale_offset")
    # Für sehr unruhige oder sehr feine Waagen anpassbar (weniger Messwerte = schneller, mehr = genauer)
    STABLE_SAMPLES = max(int(config.get("stable_samples", STABLE_SAMPLES)), STABLE_MIN_SAMPLES)
    STABLE_TOLERANCE_G = float(config.get("stable_tolerance_g", STABLE_TOLERANCE_G))
    ZERO_TRACK_RANGE_G = float(config.get("zero_track_range_g", ZERO_TRACK_RANGE_G))


def save_config():
    config["calibration_ratio"] = CALIBRATION_RATIO
    config["scale_offset"] = SCALE_OFFSET
    # Enthält das Geräte-Token -> nur für den Besitzer lesbar
    fd = os.open(CONFIG_FILE + ".tmp", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(config, f)
    os.replace(CONFIG_FILE + ".tmp", CONFIG_FILE)


def forget_pairing():
    """Zugangsdaten löschen, Kalibrierung der Waage behalten."""
    for key in ("deviceToken", "deviceKey", "topic", "clientId"):
        config.pop(key, None)
    save_config()


# ==========================================
# 2. SORTIFY-API (HTTPS)
# ==========================================
session = requests.Session()
session.headers["User-Agent"] = f"SortifyTerminal/{VERSION}"


def api(method, path, payload=None, auth=True, timeout=15):
    headers = {}
    if auth:
        headers["Authorization"] = f"Bearer {config['deviceToken']}"
    response = session.request(method, SERVER_URL + path, json=payload, headers=headers, timeout=timeout)
    if auth and response.status_code == 401:
        raise Unpaired()
    return response


def acknowledge(command_id, status="done", weight=None, stable=None):
    """Rückmeldung zu einem Auftrag (2 Versuche, damit ein kurzer Netzaussetzer nichts verliert)."""
    payload = {"id": command_id, "status": status}
    if weight is not None:
        payload["weight"] = weight
    if stable is not None:
        payload["stable"] = bool(stable)
    for attempt in range(2):
        try:
            api("POST", "/api/device/ack", payload)
            return
        except Unpaired:
            raise
        except requests.RequestException as e:
            print(f"Rückmeldung fehlgeschlagen ({attempt + 1}/2): {e}")
            time.sleep(1)


# ==========================================
# 3. HARDWARE SETUP
# ==========================================
GPIO.setwarnings(False)
GPIO.setmode(GPIO.BCM)
GPIO.setup(BUTTON_LED_PIN, GPIO.OUT)
GPIO.output(BUTTON_LED_PIN, GPIO.HIGH)

spi_disp = board.SPI()
cs_pin = digitalio.DigitalInOut(board.CE0)
dc_pin = digitalio.DigitalInOut(board.D24)
reset_pin = digitalio.DigitalInOut(board.D25)
disp = ili9341.ILI9341(spi_disp, rotation=90, cs=cs_pin, dc=dc_pin, rst=reset_pin, baudrate=24000000)
width, height = disp.height, disp.width

spi_touch = spidev.SpiDev()
spi_touch.open(0, TOUCH_CS_PIN)
spi_touch.max_speed_hz = 2000000
GPIO.setup(TOUCH_IRQ_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)

try:
    font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 45)
    font_medium = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 32)
    font_button = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
    font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
except IOError:
    font_large = font_medium = font_button = font_small = ImageFont.load_default()

pixels = neopixel.NeoPixel(LED_PIN, NUM_PIXELS, brightness=1.0, auto_write=False, pixel_order=neopixel.GRB)
pixels.fill((0, 0, 0))
pixels.show()

hx = HX711(dout_pin=HX711_DOUT_PIN, pd_sck_pin=HX711_SCK_PIN)
hx.reset()


# ==========================================
# 4. HILFSFUNKTIONEN & ANZEIGE
# ==========================================
def read_touch_pixels():
    resp_x = spi_touch.xfer2([0xD0, 0x00, 0x00])
    raw_x = ((resp_x[1] << 8) | resp_x[2]) >> 3
    resp_y = spi_touch.xfer2([0x90, 0x00, 0x00])
    raw_y = ((resp_y[1] << 8) | resp_y[2]) >> 3
    if raw_x > 100 and raw_y > 100:
        px_x = int((3280 - raw_y) / 8)
        px_y = int((raw_x - 400) * 240 / 3200)
        return max(0, min(px_x, 320)), max(0, min(px_y, 240))
    return None, None


def touched():
    return GPIO.input(TOUCH_IRQ_PIN) == GPIO.LOW


def wait_for_main_button():
    time.sleep(0.5)
    while True:
        if touched():
            px_x, _ = read_touch_pixels()
            if px_x is not None:
                time.sleep(0.2)
                return
        time.sleep(0.05)


def draw_centered(draw, text, font, y, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    draw.text(((width - (bbox[2] - bbox[0])) // 2, y), text, font=font, fill=fill)


def draw_status_screen(main_text, button_text=None, bg_color=(11, 25, 44), text_color=(255, 255, 255), custom_font=None, sub_text=None):
    image = Image.new("RGB", (width, height), bg_color)
    draw = ImageDraw.Draw(image)
    use_font = custom_font or font_large
    bbox = draw.textbbox((0, 0), main_text, font=use_font)
    text_h = bbox[3] - bbox[1]
    text_y = 60 if button_text else (height - text_h) // 2 - (12 if sub_text else 0)
    draw_centered(draw, main_text, use_font, text_y, text_color)
    if sub_text:
        draw_centered(draw, sub_text, font_small, text_y + text_h + 18, (148, 163, 184))
    if button_text:
        draw.rectangle((60, 150, 260, 210), fill=(34, 197, 94))
        bbox_btn = draw.textbbox((0, 0), button_text, font=font_button)
        draw.text((60 + (200 - (bbox_btn[2] - bbox_btn[0])) // 2, 150 + (60 - (bbox_btn[3] - bbox_btn[1])) // 2),
                  button_text, font=font_button, fill=(255, 255, 255))
    disp.image(image)


def startup_wave():
    for i in range(NUM_PIXELS):
        pixels[i] = (0, 150, 255)
        pixels.show()
        time.sleep(0.04)
        pixels[i] = (0, 0, 0)
    pixels.show()


def read_raw(count=2):
    """Rohwerte der Waage; ungültige Lesungen werden verworfen. Begrenzt: get_raw_data() der Bibliothek
    wartet bei einer defekten oder abgezogenen Waage endlos – das darf das Terminal (LEDs, Befehle) nicht
    blockieren. Jede einzelne Lesung (_read) gibt nach spätestens ~0,4 s auf."""
    read_one = getattr(hx, "_read", None)
    if read_one is None:
        data = hx.get_raw_data(count)
        values = data if isinstance(data, list) else [data]
    else:
        values = []
        for _ in range(count * 2):        # höchstens doppelt so viele Versuche wie Werte
            value = read_one()
            if value is not False and value is not None:
                values.append(value)
                if len(values) >= count:
                    break
    return [v for v in values if isinstance(v, (int, float)) and not isinstance(v, bool)]


def median(values):
    s = sorted(values)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def trimmed_mean(values):
    """Mittelwert ohne die äussersten Werte (je ein Sechstel oben und unten)."""
    s = sorted(values)
    cut = len(s) // 6
    core = s[cut:len(s) - cut] or s
    return sum(core) / len(core)


def per_gram():
    return abs(CALIBRATION_RATIO) or 1.0


def tolerance_raw(center_raw):
    """Erlaubte Schwankung als Rohwert: fest, mindestens 4× das Grundrauschen, bei schwerer Last 0,05 %."""
    grams = abs(center_raw - SCALE_OFFSET) / per_gram() if SCALE_OFFSET is not None else 0.0
    return max(STABLE_TOLERANCE_G, NOISE_FACTOR * scale_noise_g, 0.0005 * grams) * per_gram()


def measure_raw(samples=None, min_seconds=STABLE_MIN_SECONDS, timeout=WEIGH_TIMEOUT_SECONDS):
    """Liest, bis die Waage ruhig ist: mindestens `samples` Werte über `min_seconds`, die alle nah am Median
    liegen. Ein einzelner Ausreisser (Störimpuls) wird übersprungen; zwei in Folge heissen "es bewegt sich
    etwas" und die ruhige Phase beginnt neu. Gemittelt werden die letzten zwei Drittel der ruhigen Phase.
    Liefert (robuster Mittelwert, ruhig?, gemittelte Werte)."""
    samples = samples or STABLE_SAMPLES   # erst hier lesen: kann aus terminal_config.json stammen
    run, recent = deque(maxlen=200), deque(maxlen=samples)
    run_start = 0.0
    outliers = 0
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for raw in read_raw(2):
            recent.append(raw)
            if run:
                center = median(run)
                if abs(raw - center) > tolerance_raw(center):
                    outliers += 1
                    if outliers < 2:
                        continue
                    run.clear()
            if not run:
                run_start = time.monotonic()
            outliers = 0
            run.append(raw)
        if len(run) >= samples and time.monotonic() - run_start >= min_seconds:
            values = list(run)[len(run) // 3:]
            return trimmed_mean(values), True, values
    if len(run) >= STABLE_MIN_SAMPLES:
        values = list(run)[len(run) // 3:]
        return trimmed_mean(values), True, values
    return (median(recent) if recent else None), False, list(recent)


def measure_grams(quick=False):
    """Gewicht in Gramm und ob die Waage ruhig war. quick: sofort messen (Live-Anzeige), ohne auf Ruhe zu warten."""
    if quick:
        values = read_raw(3)
        raw, stable = (median(values) if values else None), None
    else:
        raw, stable, _ = measure_raw()
    if raw is None or SCALE_OFFSET is None:
        return None, False
    return round((raw - SCALE_OFFSET) / CALIBRATION_RATIO, 3), stable


def tare(require_stable=True, timeout=10):
    """Nullpunkt auf die leere Waage setzen und dabei ihr Grundrauschen bestimmen.
    Liefert True, wenn die Waage ruhig war (sonst bleibt der alte Nullpunkt, ausser require_stable=False)."""
    global SCALE_OFFSET, scale_noise_g
    previous_noise = scale_noise_g
    # Erst grob das Rauschen schätzen (Median der Abweichungen: unempfindlich gegen Störimpulse),
    # damit die Ruhe-Erkennung auch bei einer stark rauschenden Waage passende Grenzen hat
    first = read_raw(10)
    if len(first) >= 5:
        center = median(first)
        scale_noise_g = min(1.4826 * median([abs(v - center) for v in first]) / per_gram(), 2.0)
    raw, stable, values = measure_raw(samples=20, timeout=timeout)
    if raw is None or (require_stable and not stable):
        scale_noise_g = previous_noise    # Unruhe ist kein Rauschen: alte Schätzung behalten
        return False
    SCALE_OFFSET = raw
    if stable and len(values) > 2:
        mean = sum(values) / len(values)
        spread = (sum((v - mean) ** 2 for v in values) / (len(values) - 1)) ** 0.5
        scale_noise_g = min(spread / per_gram(), 2.0)
    return stable


def track_zero():
    """Leerlauf: Ist die Waage leer und ruhig, den Nullpunkt sanft nachziehen.
    So wirken sich Aufwärmen und Temperatur nicht mehr auf die Messungen aus. Liegt etwas auf
    der Waage (mehr als ZERO_TRACK_RANGE_G), bleibt der Nullpunkt unverändert."""
    global SCALE_OFFSET
    if SCALE_OFFSET is None:
        return False
    values = read_raw(3)
    if len(values) < 3:
        return None                       # Waage liefert nichts (defekt, abgezogen?)
    center = median(values)
    if max(values) - min(values) > tolerance_raw(center):
        return False                      # unruhig: jemand hantiert an der Waage
    if abs(center - SCALE_OFFSET) / per_gram() > ZERO_TRACK_RANGE_G:
        return False                      # da liegt etwas auf der Waage
    SCALE_OFFSET += (center - SCALE_OFFSET) * 0.5
    return True


def enforce_empty_scale():
    if SCALE_OFFSET is None:
        return
    raw_val, _, _ = measure_raw(samples=5, min_seconds=0.3, timeout=3)
    if raw_val is not None and abs(raw_val - SCALE_OFFSET) / per_gram() > 10.0:
        pixels.fill((255, 0, 0))
        pixels.show()
        draw_status_screen("Waage leer?", button_text="Bestätigen", bg_color=(150, 0, 0), custom_font=font_medium)
        wait_for_main_button()
        draw_status_screen("Prüfen...")
        time.sleep(0.5)
    pixels.fill((0, 0, 0))
    pixels.show()


def parse_color(raw_color):
    named = {"blue": (0, 0, 255), "red": (255, 0, 0), "green": (0, 255, 0), "yellow": (255, 150, 0)}
    c = str(raw_color or "").strip().lower()
    if c in named:
        return named[c]
    hex_part = c.lstrip("#")
    try:
        if len(hex_part) == 6:
            return tuple(int(hex_part[i:i + 2], 16) for i in (0, 2, 4))
        if len(hex_part) == 3:
            return tuple(int(ch * 2, 16) for ch in hex_part)
    except ValueError:
        pass
    return (0, 255, 0)


# ==========================================
# 5. KOPPLUNG
# ==========================================
def draw_pairing_ui(state, code=None, remaining_seconds=None):
    image = Image.new("RGB", (width, height), (11, 25, 44))
    draw = ImageDraw.Draw(image)
    if remaining_seconds is not None:
        mins, secs = divmod(remaining_seconds, 60)
        draw_centered(draw, f"Zeit: {mins:02d}:{secs:02d} Min", font_button, height - 35, (148, 163, 184))

    if state == "CODE_1":
        draw_centered(draw, "Code auf Sortify eingeben", font_button, 30, (255, 255, 255))
        bbox = draw.textbbox((0, 0), code, font=font_large)
        draw_centered(draw, code, font_large, (height - (bbox[3] - bbox[1])) // 2 - 15, (255, 255, 255))
    elif state == "CONFIRM":
        draw_centered(draw, "Gerät koppeln?", font_button, 30, (255, 255, 255))
        for x1, label, color in ((20, "Erlauben", (34, 197, 94)), (170, "Ablehnen", (239, 68, 68))):
            draw.rectangle((x1, 80, x1 + 130, 160), fill=color)
            bbox = draw.textbbox((0, 0), label, font=font_button)
            draw.text((x1 + (130 - (bbox[2] - bbox[0])) // 2, 80 + (80 - (bbox[3] - bbox[1])) // 2), label, font=font_button, fill=(255, 255, 255))
    elif state == "CODE_2":
        draw_centered(draw, "Schritt 3: Bestätigen", font_button, 30, (255, 255, 255))
        bbox = draw.textbbox((0, 0), code, font=font_large)
        draw_centered(draw, code, font_large, (height - (bbox[3] - bbox[1])) // 2 - 15, (34, 197, 94))
    disp.image(image)


def run_pairing_mode():
    """Holt einen Code bei Sortify, wartet auf die Eingabe im Web und speichert die Zugangsdaten."""
    print("📡 Kopplungsmodus – Sortify:", SERVER_URL)
    while True:
        try:
            response = api("POST", "/api/device/pair/start", auth=False)
            if response.status_code == 429:
                draw_status_screen("Bitte warten", custom_font=font_medium, sub_text="Zu viele Versuche")
                time.sleep(60)
                continue
            response.raise_for_status()
            pairing = response.json()
        except requests.RequestException as e:
            print("Sortify nicht erreichbar:", e)
            draw_status_screen("Offline", custom_font=font_medium, sub_text="Netzwerk prüfen – neuer Versuch")
            time.sleep(10)
            continue

        credentials = {"pairingId": pairing["pairingId"], "secret": pairing["secret"]}
        state, shown_code = "CODE_1", pairing["code"]
        deadline = time.monotonic() + pairing.get("expiresInSeconds", 600)
        last_ui = last_poll = 0

        while time.monotonic() < deadline:
            now = time.monotonic()
            if now - last_ui >= 1.0:
                draw_pairing_ui(state, shown_code, int(deadline - now))
                last_ui = now

            if now - last_poll >= 2.0:
                last_poll = now
                try:
                    response = api("POST", "/api/device/pair/poll", credentials, auth=False)
                except requests.RequestException:
                    continue
                if response.status_code == 404:
                    break  # abgelaufen -> neuer Code
                data = response.json()
                status = data.get("status")
                if status == "user_claimed" and state == "CODE_1":
                    state, last_ui = "CONFIRM", 0
                elif status == "pi_confirmed" and data.get("code2") and state != "CODE_2":
                    state, shown_code, last_ui = "CODE_2", data["code2"], 0
                elif status == "paired":
                    config.update({
                        "deviceToken": data["token"],
                        "deviceKey": data["key"],
                        "topic": data["topic"],
                        "clientId": "sortify-terminal-" + uuid.uuid4().hex[:16],
                    })
                    save_config()
                    draw_status_screen("Gekoppelt!", text_color=(34, 197, 94))
                    time.sleep(3)
                    return

            if state == "CONFIRM" and touched():
                px_x, _ = read_touch_pixels()
                if px_x is not None:
                    accept = px_x < 160
                    try:
                        response = api("POST", "/api/device/pair/answer", {**credentials, "accept": accept}, auth=False)
                    except requests.RequestException:
                        time.sleep(0.5)
                        continue
                    data = response.json() if response.ok else {}
                    if not accept or not data.get("code2"):
                        break  # abgelehnt oder abgelaufen -> neuer Code
                    state, shown_code, last_ui = "CODE_2", data["code2"], 0
                    deadline = time.monotonic() + 600
                    time.sleep(0.3)
            time.sleep(0.05)


# ==========================================
# 6. MQTT (Befehle empfangen)
# ==========================================
commands = queue.Queue()
seen_message_ids = deque(maxlen=500)
# Serverzeit = monotone Uhr + Abstand. Die monotone Uhr springt nicht, wenn die Systemuhr nach dem
# Einschalten übers Internet gestellt wird (der Raspberry Pi hat keine eingebaute Uhr). Ein einmaliger
# Abgleich mit der Systemuhr wäre danach falsch und alle Befehle würden als "zu alt" verworfen.
server_offset_ms = None


def server_now_ms():
    if server_offset_ms is None:
        return time.time() * 1000
    return time.monotonic() * 1000 + server_offset_ms
mqtt_connected = False


def decrypt_message(payload, topic):
    key = base64.b64decode(config["deviceKey"])
    nonce, body = payload[:12], payload[12:]          # body = Chiffretext + 16 Byte Tag
    return json.loads(AESGCM(key).decrypt(nonce, body, topic.encode("utf-8")))


def on_connect(client, userdata, flags, reason_code, properties):
    global mqtt_connected
    if reason_code.is_failure:
        print("MQTT-Anmeldung fehlgeschlagen:", reason_code)
        return
    mqtt_connected = True
    client.subscribe(userdata["topic"], qos=1)
    print("✅ MQTT verbunden, warte auf Befehle")


def on_disconnect(client, userdata, flags, reason_code, properties):
    global mqtt_connected
    mqtt_connected = False
    print("MQTT getrennt:", reason_code)


def on_message(client, userdata, msg):
    try:
        message = decrypt_message(msg.payload, msg.topic)
    except Exception:
        print("Nachricht verworfen (falscher Schlüssel oder verändert)")
        return
    if message.get("mid") in seen_message_ids:
        return  # doppelt
    age_ms = server_now_ms() - message.get("ts", 0)
    if abs(age_ms) > MAX_MESSAGE_AGE_MS:
        print(f"Nachricht verworfen: {age_ms / 1000:.0f} s alt (erlaubt: {MAX_MESSAGE_AGE_MS // 1000} s)")
        return
    seen_message_ids.append(message.get("mid"))
    commands.put(message)


def connect_mqtt(settings, prefix):
    topic = f"{prefix}/d/{config['topic']}/cmd"
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=config["clientId"],
                         clean_session=False, userdata={"topic": topic})
    client.username_pw_set(settings["username"], settings["password"])
    if settings.get("tls", True):
        client.tls_set()   # TLS mit den Zertifikaten des Systems
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message
    client.reconnect_delay_set(min_delay=1, max_delay=60)
    client.connect_async(settings["host"], settings["port"], keepalive=60)
    client.loop_start()
    return client


def fetch_device_config():
    """Lebenszeichen an Sortify; liefert Broker-Daten und die Serverzeit."""
    global server_offset_ms
    before = time.monotonic() * 1000
    response = api("GET", "/api/device/config")
    response.raise_for_status()
    data = response.json()
    server_offset_ms = data["serverTime"] - (before + time.monotonic() * 1000) / 2
    return data


# ==========================================
# 7. NORMALER BETRIEB
# ==========================================
def run_normal_mode():
    global CALIBRATION_RATIO, SCALE_OFFSET

    draw_status_screen("Verbinden...", custom_font=font_medium)
    while True:
        try:
            device_config = fetch_device_config()
            break
        except requests.RequestException as e:
            print("Sortify nicht erreichbar:", e)
            draw_status_screen("Offline", custom_font=font_medium, sub_text="Netzwerk prüfen – neuer Versuch")
            time.sleep(15)

    if not device_config.get("mqtt"):
        draw_status_screen("Nicht bereit", custom_font=font_medium, sub_text="Server ohne MQTT eingerichtet")
        time.sleep(60)
        sys.exit(1)

    client = connect_mqtt(device_config["mqtt"], device_config.get("topicPrefix", "sortify"))
    system_name = device_config.get("systemName", "")
    print(f"🚀 Betrieb für Lager '{system_name}'")

    draw_status_screen("Starten...", text_color=(34, 197, 94))
    startup_wave()
    draw_status_screen("Prüfen...")
    enforce_empty_scale()
    # Bei jedem Start frisch tarieren (gleicht Temperatur- und Materialdrift aus); danach führt
    # track_zero() den Nullpunkt im Leerlauf nach
    draw_status_screen("Tarieren...")
    tare(require_stable=False)
    save_config()

    def show_ready():
        draw_status_screen("Bereit", text_color=(34, 197, 94), sub_text=system_name)

    show_ready()

    blink_indices, solid_indices = [], []
    blink_state = False
    last_blink_time = blink_start_time = 0
    led_color = (0, 255, 0)
    last_activity = last_heartbeat = last_zero_track = time.monotonic()
    last_weighing = 0.0
    sleeping = False

    def wake_up():
        nonlocal sleeping, last_activity
        last_activity = time.monotonic()
        if sleeping:
            sleeping = False
            show_ready()

    def finish_calibration(command_id, ok):
        draw_status_screen("Gespeichert!" if ok else "Fehler!", bg_color=(34, 197, 94) if ok else (239, 68, 68))
        acknowledge(command_id, "done" if ok else "error")
        time.sleep(1.5)
        show_ready()

    try:
        while True:
            now = time.monotonic()
            if touched():
                wake_up()
                time.sleep(0.3)
            if not sleeping and now - last_activity > SCREEN_TIMEOUT_SECONDS:
                sleeping = True
                disp.image(Image.new("RGB", (width, height), (0, 0, 0)))

            # Lebenszeichen; 401 -> Terminal wurde in Sortify entfernt
            if now - last_heartbeat > HEARTBEAT_SECONDS:
                last_heartbeat = now
                try:
                    new_name = fetch_device_config().get("systemName", system_name)
                    if new_name != system_name:   # z.B. Terminal in Sortify umbenannt
                        system_name = new_name
                        if not sleeping:
                            show_ready()
                except requests.RequestException as e:
                    print("Lebenszeichen fehlgeschlagen:", e)

            try:
                message = commands.get_nowait()
            except queue.Empty:
                message = None

            if message:
                kind = message.get("t")
                if kind == "ping":
                    # Verbindungstest von Sortify: sofort antworten, Display nicht aufwecken
                    try:
                        api("POST", "/api/device/pong", timeout=10)
                    except requests.RequestException as e:
                        print("Antwort auf Verbindungstest fehlgeschlagen:", e)
                    continue
                wake_up()
                if kind == "unpaired":
                    raise Unpaired()

                elif kind == "calibrate_zero":
                    draw_status_screen("Kalibrierung...")
                    ok = tare(timeout=CALIBRATION_TIMEOUT_SECONDS)   # nur, wenn die Waage ruhig ist
                    if ok:
                        save_config()
                    last_weighing = time.monotonic()
                    finish_calibration(message.get("id"), ok)

                elif kind == "calibrate_ratio":
                    draw_status_screen("Kalibrierung...")
                    known_weight = float(message.get("weight") or 0)
                    raw_val, stable, _ = measure_raw(samples=20, timeout=CALIBRATION_TIMEOUT_SECONDS)
                    ok = stable and raw_val is not None and SCALE_OFFSET is not None and known_weight > 0 and raw_val != SCALE_OFFSET
                    last_weighing = time.monotonic()
                    if ok:
                        CALIBRATION_RATIO = (raw_val - SCALE_OFFSET) / known_weight
                        save_config()
                    finish_calibration(message.get("id"), ok)

                elif kind == "weigh":
                    # Live-Anzeige ("quick"): sofort messen; sonst warten, bis die Waage ruhig ist
                    quick = bool(message.get("quick"))
                    if not quick:
                        draw_status_screen("Wiegen...", custom_font=font_medium)
                    grams, stable = measure_grams(quick)
                    last_weighing = time.monotonic()
                    if grams is None:
                        acknowledge(message.get("id"), "error")
                    else:
                        acknowledge(message.get("id"), "done", grams, stable)
                    if not quick:
                        show_ready()

                elif kind == "led":
                    drawers = [int(d) for d in message.get("drawers", [])]
                    led_color = parse_color(message.get("color"))
                    mode = message.get("mode", "blink")
                    if not drawers or 0 in drawers or -1 in drawers:
                        blink_indices, solid_indices = [], []
                        pixels.fill((0, 0, 0))
                    else:
                        for drawer in drawers:
                            i = drawer - 1
                            if not 0 <= i < NUM_PIXELS:
                                continue
                            for lst in (blink_indices, solid_indices):
                                if i in lst:
                                    lst.remove(i)
                            if led_color == (0, 0, 0):
                                pixels[i] = (0, 0, 0)
                            elif mode == "solid":
                                solid_indices.append(i)
                                pixels[i] = led_color
                            else:
                                blink_indices.append(i)
                        if mode == "blink" and led_color != (0, 0, 0):
                            blink_state = True
                            for i in blink_indices:
                                pixels[i] = led_color
                        last_blink_time = blink_start_time = time.monotonic()
                    pixels.show()

            # LEDs nach Ablauf der Zeit ausschalten
            if (blink_indices or solid_indices) and time.monotonic() - blink_start_time >= LED_TIMEOUT_SECONDS:
                blink_indices, solid_indices = [], []
                pixels.fill((0, 0, 0))
                pixels.show()

            if blink_indices and time.monotonic() - last_blink_time >= 0.5:
                blink_state = not blink_state
                for i in blink_indices:
                    pixels[i] = led_color if blink_state else (0, 0, 0)
                pixels.show()
                last_blink_time = time.monotonic()

            # Nullpunkt im Leerlauf nachführen (nicht während LEDs leuchten: das Lesen dauert ~0,3 s)
            if (not message and not blink_indices and not solid_indices
                    and now - last_zero_track >= ZERO_TRACK_EVERY_SECONDS
                    and time.monotonic() - last_weighing >= ZERO_TRACK_PAUSE_SECONDS):
                last_zero_track = now
                if track_zero() is None:
                    last_zero_track = now + 60   # Waage antwortet nicht: erst in einer Minute wieder versuchen

            time.sleep(0.05)
    finally:
        client.loop_stop()
        client.disconnect()


# ==========================================
# 8. START & BEENDEN
# ==========================================
def shutdown_hardware():
    try:
        pixels.fill((0, 0, 0))
        pixels.show()
        GPIO.output(BUTTON_LED_PIN, GPIO.LOW)
    except Exception:
        pass


def handle_shutdown(signum, frame):
    try:
        shutdown_hardware()
        draw_status_screen("Beenden...", bg_color=(150, 0, 0))
        time.sleep(2.5)
        disp.image(Image.new("RGB", (width, height), (0, 0, 0)))
    finally:
        sys.exit(0)


def main():
    load_config()
    while True:
        if not config.get("deviceToken"):
            run_pairing_mode()
        try:
            run_normal_mode()
        except Unpaired:
            print("❌ Terminal wurde in Sortify entfernt – neue Kopplung")
            forget_pairing()
            pixels.fill((0, 0, 0))
            pixels.show()
            draw_status_screen("Getrennt", bg_color=(150, 0, 0), custom_font=font_medium)
            time.sleep(3)


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, handle_shutdown)
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception:
        print("\n!!! KRITISCHER FEHLER !!!")
        print(traceback.format_exc())
        try:
            draw_status_screen("Systemfehler!", button_text="Siehe Konsole", bg_color=(150, 0, 0), custom_font=font_medium)
            time.sleep(10)
        except Exception:
            pass
        sys.exit(1)   # systemd startet das Terminal neu
    finally:
        shutdown_hardware()
        for cleanup in (spi_touch.close, GPIO.cleanup):
            try:
                cleanup()
            except Exception:
                pass
