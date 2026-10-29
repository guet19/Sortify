<script>
    // KI-Werkzeuge im Bild-Editor (Artikel anlegen & bearbeiten): Hintergrund oder Schrift entfernen.
    // blob = aktuelles Originalbild im Editor; onResult(neuesBild) öffnet es im Editor.
    import { cleanImage } from '$lib/imageAi.js';

    export let blob = null;
    export let onResult = () => {};

    let busy = '';
    let error = '';
    let history = []; // Bilder vor der jeweiligen KI-Bearbeitung (für "Rückgängig")

    async function run(mode) {
        if (!blob || busy) return;
        busy = mode;
        error = '';
        const before = blob;
        try {
            const result = await cleanImage(before, mode);
            history = [...history, before];
            await onResult(result);
        } catch (e) {
            error = e?.name === 'TimeoutError' ? 'Die Bearbeitung hat zu lange gedauert. Bitte erneut versuchen.' : (e?.message || 'Das Bild konnte nicht bearbeitet werden.');
        } finally {
            busy = '';
        }
    }

    async function undo() {
        const previous = history[history.length - 1];
        if (!previous || busy) return;
        history = history.slice(0, -1);
        error = '';
        await onResult(previous);
    }
</script>

<div class="ai-tools">
    <span class="ai-label">KI</span>
    <button type="button" class="ai-btn" on:click={() => run('background')} disabled={!!busy || !blob}
        title="Entfernt den Hintergrund samt Schrift – der Artikel steht danach auf Weiss">
        {busy === 'background' ? 'Wird freigestellt…' : '✨ Hintergrund entfernen'}
    </button>
    <button type="button" class="ai-btn" on:click={() => run('text')} disabled={!!busy || !blob}
        title="Entfernt jede Schrift im Bild und füllt die Stellen auf – auch Schrift auf dem Artikel">
        {busy === 'text' ? 'Schrift wird entfernt…' : '🔤 Schrift entfernen'}
    </button>
    {#if history.length && !busy}
        <button type="button" class="ai-btn undo" on:click={undo}>↩ Rückgängig</button>
    {/if}
    {#if busy}
        <span class="ai-hint" role="status"><span class="spinner"></span>Cloudinary bearbeitet das Bild – das dauert einige Sekunden.</span>
    {/if}
    {#if error}
        <span class="ai-error" role="alert">{error}</span>
    {/if}
</div>

<style>
    .ai-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding: 0.6rem 0.75rem; border: 1px dashed #c4b5fd; border-radius: 8px; background: #faf5ff; }
    .ai-label { font-size: 0.7rem; font-weight: 800; letter-spacing: 0.08em; color: #7c3aed; background: #ede9fe; border-radius: 999px; padding: 0.1rem 0.5rem; }
    .ai-btn { background: #ffffff; color: #4c1d95; border: 1px solid #c4b5fd; border-radius: 6px; padding: 0.45rem 0.8rem; font-weight: 600; font-size: 0.88rem; cursor: pointer; font-family: inherit; }
    .ai-btn:hover:not(:disabled) { background: #f5f3ff; border-color: #8b5cf6; }
    .ai-btn:disabled { opacity: 0.55; cursor: wait; }
    .ai-btn.undo { color: #334155; border-color: #cbd5e1; }
    .ai-hint { flex-basis: 100%; display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: #6d28d9; }
    .ai-error { flex-basis: 100%; font-size: 0.85rem; color: #b91c1c; font-weight: 600; }
    .spinner { width: 14px; height: 14px; border: 2px solid #ddd6fe; border-top-color: #7c3aed; border-radius: 50%; animation: spin 0.8s linear infinite; flex: none; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
</style>
