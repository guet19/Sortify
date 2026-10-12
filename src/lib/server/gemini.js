import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';
import db from '$lib/server/db.js';

// Modelle in der Reihenfolge, in der sie versucht werden (bestes zuerst).
// Ist das Kontingent eines Modells erschöpft oder ist es überlastet, wird automatisch das nächste genutzt.
export const AI_TIERS = {
    best: 'Beste Ergebnisse',
    good: 'Gute Ergebnisse'
};
export const AI_MODELS = [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', tier: 'best' },
    { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', tier: 'best' },
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', tier: 'best' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', tier: 'best' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'best' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', tier: 'good' },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', tier: 'good' }
];

let client;

class AiError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Tageskontingente von Google werden um Mitternacht Pazifikzeit zurückgesetzt
function nextQuotaReset() {
    const now = new Date();
    const pacificNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const pacificMidnight = new Date(pacificNow);
    pacificMidnight.setHours(24, 0, 0, 0);
    return new Date(now.getTime() + (pacificMidnight - pacificNow) + 60_000);
}

const isTimeout = (error) => error?.name === 'TimeoutError' || error?.name === 'AbortError' || /aborted|timed? ?out/i.test(String(error?.message));

// Wie lange ein Modell nach einem Fehler übersprungen wird (null = Fehler nicht modellbedingt)
function cooldownFor(error) {
    if (isTimeout(error)) return { until: new Date(Date.now() + 2 * 60_000), reason: 'timeout' };
    const status = Number(error?.status || error?.code);
    const text = String(error?.message || '');
    if (status === 429) {
        const perDay = /PerDay|per day|daily/i.test(text);
        return { until: perDay ? nextQuotaReset() : new Date(Date.now() + 60_000), reason: perDay ? 'quota_day' : 'quota_minute' };
    }
    if ([500, 502, 503, 504].includes(status)) return { until: new Date(Date.now() + 30_000), reason: 'unavailable' };
    if (status === 404) return { until: new Date(Date.now() + 24 * 3600_000), reason: 'not_found' };
    return null;
}

// --- Gesperrte Modelle: in der DB, damit alle Server-Instanzen davon wissen ---
async function getBlockedModels() {
    try {
        const database = await db.getDb();
        const docs = await database.collection('ai_model_status').find({ until: { $gt: new Date() } }).toArray();
        return new Map(docs.map(d => [d._id, d]));
    } catch (err) {
        console.warn('KI-Modellstatus nicht lesbar:', err.message);
        return new Map();
    }
}

async function blockModel(modelId, { until, reason }) {
    try {
        const database = await db.getDb();
        await database.collection('ai_model_status').updateOne(
            { _id: modelId },
            { $set: { until, reason, updatedAt: new Date() } },
            { upsert: true }
        );
    } catch (err) {
        console.warn('KI-Modellstatus nicht speicherbar:', err.message);
    }
}

function describeModel(model, skipped) {
    return {
        id: model.id,
        label: model.label,
        tier: model.tier,
        tierLabel: AI_TIERS[model.tier],
        // Wurde ein besseres Modell übersprungen? Dann dem Nutzer den Grund zeigen
        fallback: skipped.length > 0,
        skipped: skipped.map(s => ({ label: s.label, reason: s.reason }))
    };
}

// Welches Modell würde gerade verwendet? (für die Anzeige vor einer KI-Aktion)
export async function getCurrentAiModel() {
    const blocked = await getBlockedModels();
    const skipped = [];
    for (const model of AI_MODELS) {
        const block = blocked.get(model.id);
        if (!block) return describeModel(model, skipped);
        skipped.push({ label: model.label, reason: block.reason });
    }
    return null; // alle Kontingente erschöpft
}

// Reihenfolge je nach Aufgabe: 'best' = Qualität zuerst, 'fast' = schnelle Lite-Modelle zuerst
// (z.B. für einfache Zuordnungen – schont das kleine Tageskontingent der besten Modelle)
function modelOrder(prefer) {
    if (prefer !== 'fast') return AI_MODELS;
    return [...AI_MODELS.filter(m => m.tier === 'good'), ...AI_MODELS.filter(m => m.tier !== 'good')];
}

// Ruft Gemini auf und liefert { data, model } – mit automatischem Modellwechsel.
// timeoutMs: max. Wartezeit pro Modell, deadlineMs: max. Gesamtdauer über alle Modelle
export async function generateJson({ contents, config = {}, prefer = 'best', timeoutMs = 20_000, deadlineMs = 45_000 }) {
    if (!env.GEMINI_API_KEY) throw new AiError('missing_key', 500);
    client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

    const deadline = Date.now() + deadlineMs;
    const blocked = await getBlockedModels();
    const skipped = [];
    let lastError;

    for (const model of modelOrder(prefer)) {
        const block = blocked.get(model.id);
        if (block) {
            skipped.push({ label: model.label, reason: block.reason });
            continue;
        }

        // Pro Modell ein zweiter Versuch, falls nur die Antwort unbrauchbar war
        for (let attempt = 0; attempt < 2; attempt++) {
            const remaining = deadline - Date.now();
            if (remaining < 2_000) throw lastError && !isTimeout(lastError) ? lastError : new AiError('timeout', 504);
            try {
                const response = await client.models.generateContent({
                    model: model.id,
                    contents,
                    config: {
                        ...config,
                        responseMimeType: 'application/json',
                        // Hängende Anfragen abbrechen, statt endlos zu warten
                        abortSignal: AbortSignal.timeout(Math.min(timeoutMs, remaining))
                    }
                });
                const match = (response.text || '').match(/\{[\s\S]*\}/);
                if (!match) throw new Error('invalid_json');
                return { data: JSON.parse(match[0]), model: describeModel(model, skipped) };
            } catch (error) {
                lastError = error;
                const invalidAnswer = error.message === 'invalid_json' || error instanceof SyntaxError;
                if (invalidAnswer && attempt === 0) { await sleep(500); continue; }

                const cooldown = cooldownFor(error);
                if (!cooldown && !invalidAnswer) throw error; // z.B. ungültige Anfrage – anderes Modell hilft nicht
                if (cooldown) {
                    console.warn(`KI-Modell ${model.id} übersprungen (${cooldown.reason}) bis ${cooldown.until.toISOString()}`);
                    await blockModel(model.id, cooldown);
                    skipped.push({ label: model.label, reason: cooldown.reason });
                }
                break; // nächstes Modell
            }
        }
    }

    throw lastError ?? new AiError('all_models_exhausted', 429);
}

// Verständliche Meldung für die Oberfläche (Details stehen im Server-Log)
export function aiErrorMessage(error, fallback = 'Fehler bei der KI-Generierung.') {
    const status = Number(error?.status || error?.code);
    const text = String(error?.message || '');
    if (text === 'missing_key') return 'Auf dem Server ist kein KI-Schlüssel hinterlegt.';
    if (text === 'timeout' || isTimeout(error)) return 'Die KI hat zu lange gebraucht. Bitte erneut versuchen.';
    if (text === 'all_models_exhausted' || status === 429 || /quota|rate/i.test(text)) {
        return 'Die Tageskontingente aller KI-Modelle sind aufgebraucht. Sie werden um 09:00 Uhr (Mitternacht Pazifikzeit) zurückgesetzt.';
    }
    if (status === 503 || /overloaded|unavailable|high demand/i.test(text)) return 'Alle KI-Modelle sind gerade überlastet. Bitte in einem Moment erneut versuchen.';
    if (text === 'invalid_json' || error instanceof SyntaxError) return 'Die KI hat keine verwertbare Antwort geliefert. Bitte erneut versuchen.';
    return fallback;
}
