import { describe, it, expect, vi, beforeEach } from 'vitest';

// Nachgebildeter KI-Dienst: Modell-Verhalten pro Test einstellbar
const behaviour = {};
const calls = [];
vi.mock('$env/dynamic/private', () => ({ env: { GEMINI_API_KEY: 'test' } }));
vi.mock('@google/genai', () => ({
    GoogleGenAI: class {
        constructor() {
            this.models = {
                generateContent: async ({ model }) => {
                    calls.push(model);
                    const b = behaviour[model];
                    if (b) { const e = new Error(b.message || 'Fehler'); e.status = b.status; throw e; }
                    return { text: '{"ok": true}' };
                }
            };
        }
    }
}));
// Gesperrte Modelle im Speicher statt in MongoDB
const store = new Map();
vi.mock('$lib/server/db.js', () => ({
    default: {
        getDb: async () => ({
            collection: () => ({
                find: (q) => ({ toArray: async () => [...store.values()].filter((d) => d.until > q.until.$gt) }),
                updateOne: async (f, u) => { store.set(f._id, { _id: f._id, ...u.$set }); }
            })
        })
    }
}));

const { generateJson, getCurrentAiModel, aiErrorMessage, AI_MODELS } = await import('../gemini.js');

beforeEach(() => {
    calls.length = 0;
    store.clear();
    Object.keys(behaviour).forEach((k) => delete behaviour[k]);
});

describe('Modellwechsel', () => {
    it('nutzt das beste Modell, wenn es verfügbar ist', async () => {
        const r = await generateJson({ contents: 'x' });
        expect(r.data).toEqual({ ok: true });
        expect(r.model.id).toBe(AI_MODELS[0].id);
        expect(r.model.fallback).toBe(false);
    });

    it('wechselt bei erschöpftem Tageskontingent und Überlastung und merkt sich das', async () => {
        behaviour[AI_MODELS[0].id] = { status: 429, message: 'quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier' };
        behaviour[AI_MODELS[1].id] = { status: 503, message: 'high demand' };
        const r = await generateJson({ contents: 'x' });
        expect(r.model.id).toBe(AI_MODELS[2].id);
        expect(r.model.skipped.map((s) => s.reason)).toEqual(['quota_day', 'unavailable']);

        calls.length = 0;
        await generateJson({ contents: 'x' });
        expect(calls).toEqual([AI_MODELS[2].id]); // gesperrte Modelle werden nicht erneut versucht
        expect((await getCurrentAiModel()).id).toBe(AI_MODELS[2].id);
    });

    it('nutzt bei "fast" zuerst die schnellen Modelle', async () => {
        const r = await generateJson({ contents: 'x', prefer: 'fast' });
        expect(r.model.tier).toBe('good');
    });

    it('bricht bei ungültiger Anfrage sofort ab', async () => {
        behaviour[AI_MODELS[0].id] = { status: 400, message: 'invalid argument' };
        await expect(generateJson({ contents: 'x' })).rejects.toThrow('invalid argument');
        expect(calls).toHaveLength(1);
    });

    it('liefert verständliche Meldungen', () => {
        expect(aiErrorMessage(new Error('all_models_exhausted'))).toMatch(/Tageskontingente/);
        expect(aiErrorMessage({ status: 503, message: 'overloaded' })).toMatch(/überlastet/);
    });
});

describe('Zweitversuch mit schnellen Modellen', () => {
    it('nur bei Zeitüberschreitung und wenn nicht schon schnell', async () => {
        const { canRetryFast } = await import('../gemini.js');
        const timeout = new Error('timeout');
        expect(canRetryFast(timeout, 'best')).toBe(true);
        expect(canRetryFast(timeout, 'fast')).toBe(false);
        expect(canRetryFast(new Error('invalid_json'), 'best')).toBe(false);
    });

    it('beachtet das Zeitbudget der Server-Funktion', async () => {
        const { aiTimeBudgetMs } = await import('../gemini.js');
        expect(aiTimeBudgetMs()).toBeGreaterThan(0);
    });
});
