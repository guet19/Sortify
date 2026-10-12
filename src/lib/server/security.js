import crypto from 'crypto';
import dns from 'dns/promises';
import net from 'net';

// ==========================================
// PASSWÖRTER
// ==========================================

export const MIN_PASSWORD_LENGTH = 10;
export const BCRYPT_ROUNDS = 12; // Höhere Kosten = langsamer zu knacken (alte Hashes bleiben gültig)

export function passwordError(password) {
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
        return `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`;
    }
    if (password.length > 72) {
        // bcrypt berücksichtigt nur die ersten 72 Bytes
        return 'Das Passwort darf maximal 72 Zeichen lang sein.';
    }
    return null;
}

// ==========================================
// TOKENS & CODES
// ==========================================

// Zufälliges, nicht erratbares Token (z.B. für Session-Cookies)
export function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// In der DB speichern wir nur den Hash, nie das Token selbst
export function hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// Kryptografisch sicherer 6-stelliger Code (ersetzt Math.random)
export function generateNumericCode() {
    return crypto.randomInt(100000, 1000000).toString();
}

// ==========================================
// EINGABE-HELFER
// ==========================================

// Sonderzeichen escapen, bevor Nutzereingaben in eine RegExp wandern
export function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Nur interne Pfade als Weiterleitungsziel erlauben (verhindert Open Redirects)
export function safeRedirect(target, fallback = '/') {
    if (typeof target !== 'string') return fallback;
    if (!target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return fallback;
    return target;
}

// Nur http(s)-Links speichern – verhindert z.B. "javascript:"-Links in <a href>
export function safeHttpUrl(value) {
    const raw = value?.toString().trim();
    if (!raw) return '';
    try {
        const url = new URL(raw);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
    } catch {
        return '';
    }
}

export function isHexColor(value) {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

// ==========================================
// SSRF-SCHUTZ FÜR SERVERSEITIGE FETCHES
// ==========================================

function isPrivateIp(ip) {
    if (net.isIPv4(ip)) {
        const [a, b] = ip.split('.').map(Number);
        return a === 0 || a === 10 || a === 127 ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            a >= 224;
    }
    const lower = ip.toLowerCase();
    if (lower.startsWith('::ffff:')) return isPrivateIp(lower.slice(7));
    return lower === '::' || lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
}

// Prüft, ob eine URL öffentlich erreichbar ist (kein localhost, keine internen Netze)
export async function assertPublicUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new Error('Ungültige URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Nur http(s)-URLs sind erlaubt');
    }

    const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
    const addresses = net.isIP(hostname)
        ? [hostname]
        : (await dns.lookup(hostname, { all: true })).map(a => a.address);

    if (addresses.length === 0 || addresses.some(isPrivateIp)) {
        throw new Error('Ziel-Adresse ist nicht erlaubt');
    }
    return parsed;
}

// fetch mit SSRF-Prüfung, Timeout und ohne automatische Redirects auf interne Ziele
export async function safeFetch(rawUrl, options = {}, { timeoutMs = 8000, maxRedirects = 3 } = {}) {
    let currentUrl = rawUrl;
    for (let i = 0; i <= maxRedirects; i++) {
        await assertPublicUrl(currentUrl);
        const response = await fetch(currentUrl, {
            ...options,
            redirect: 'manual',
            signal: AbortSignal.timeout(timeoutMs)
        });
        const location = response.headers.get('location');
        if (response.status >= 300 && response.status < 400 && location) {
            currentUrl = new URL(location, currentUrl).toString();
            continue;
        }
        return response;
    }
    throw new Error('Zu viele Weiterleitungen');
}

// Liest einen Response-Body mit Größenlimit
export async function readLimited(response, maxBytes) {
    const declared = Number(response.headers.get('content-length'));
    if (declared && declared > maxBytes) throw new Error('Antwort zu groß');

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel();
            throw new Error('Antwort zu groß');
        }
        chunks.push(value);
    }
    return Buffer.concat(chunks);
}
