<script>
    import TerminalHeader from '$lib/components/TerminalHeader.svelte';
    import { enhance } from '$app/forms';
    export let data;
    export let form;

    let starting = null;
    const day = (iso) => new Date(iso).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const chf = (v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(2)} CHF`;
</script>

<div class="terminal-page space-grotesk">
    <TerminalHeader title="Inventur" subtitle="Ein Regal Fach für Fach wiegen – am Ende siehst du alle Abweichungen." backHref="/terminal" />

    {#if form?.error}<div class="error-box" role="alert">{form.error}</div>{/if}

    <h2 class="section-title">Regal wählen</h2>
    {#if data.shelves.length === 0}
        <p class="muted">Es sind noch keine Regale angelernt (Einstellungen → Fächer anlernen).</p>
    {:else}
        <div class="shelf-grid">
            {#each data.shelves as shelf (shelf.id)}
                <form method="POST" action="?/start" class="shelf-card" use:enhance={() => { starting = shelf.id; return async ({ update }) => { await update(); starting = null; }; }}>
                    <input type="hidden" name="shelfId" value={shelf.id} />
                    <div class="shelf-name">🗄️ {shelf.name}</div>
                    <div class="shelf-meta">
                        {shelf.drawers} {shelf.drawers === 1 ? 'Fach' : 'Fächer'} mit Artikeln{shelf.terminal ? ` · ${shelf.terminal}` : ''}
                    </div>
                    {#if shelf.open}
                        <div class="progress-text">Begonnen am {day(shelf.open.startedAt)} · {shelf.open.counted + shelf.open.skipped} von {shelf.open.total} erledigt</div>
                        <button type="submit" class="big-btn blue" disabled={starting !== null}>Inventur fortsetzen</button>
                    {:else}
                        <button type="submit" class="big-btn green" disabled={!shelf.drawers || starting !== null}>
                            {starting === shelf.id ? 'Wird gestartet…' : 'Inventur starten'}
                        </button>
                    {/if}
                </form>
            {/each}
        </div>
    {/if}

    {#if data.recent.length}
        <h2 class="section-title">Letzte Inventuren</h2>
        <div class="history">
            {#each data.recent as s (s.id)}
                <a href="/terminal/inventur/{s.id}" class="history-row">
                    <span class="muted">{day(s.finishedAt)}</span>
                    <strong>{s.shelfName}</strong>
                    {#if s.status === 'discarded'}
                        <span class="badge gray">verworfen</span>
                    {:else if s.deviationCount === 0}
                        <span class="badge green">keine Abweichung</span>
                    {:else}
                        <span class="badge orange">{s.deviationCount} {s.deviationCount === 1 ? 'Abweichung' : 'Abweichungen'} · {chf(s.valueDelta)}</span>
                    {/if}
                    <span class="arrow" aria-hidden="true">›</span>
                </a>
            {/each}
        </div>
    {/if}
</div>

<style>
    .terminal-page { max-width: 1000px; margin: 0 auto; color: #f8fafc; }
    .section-title { font-size: 1.3rem; color: #cbd5e1; margin: 2rem 0 1rem 0; }
    .section-title:first-of-type { margin-top: 0; }
    .muted { color: #94a3b8; }
    .error-box { background: rgba(239, 68, 68, 0.12); border: 1px solid #ef4444; color: #fecaca; padding: 1rem 1.25rem; border-radius: 12px; margin-bottom: 1.5rem; font-weight: 600; }
    .shelf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.25rem; }
    .shelf-card { background: #1e293b; border: 2px solid #334155; border-radius: 16px; padding: 1.5rem; display: flex; flex-direction: column; gap: 0.6rem; }
    .shelf-name { font-size: 1.4rem; font-weight: 700; }
    .shelf-meta { color: #94a3b8; font-weight: 600; }
    .progress-text { color: #93c5fd; font-weight: 600; font-size: 0.95rem; }
    .big-btn { margin-top: 0.5rem; min-height: 60px; border: none; border-radius: 12px; font-size: 1.15rem; font-weight: 700; cursor: pointer; font-family: inherit; }
    .big-btn.green { background: #22c55e; color: #052e16; }
    .big-btn.blue { background: #3b82f6; color: #fff; }
    .big-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .history { display: flex; flex-direction: column; gap: 0.6rem; }
    .history-row { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 1rem 1.25rem; color: inherit; text-decoration: none; }
    .history-row:hover { border-color: #3b82f6; }
    .arrow { margin-left: auto; color: #64748b; font-size: 1.5rem; }
    .badge { font-size: 0.85rem; font-weight: 700; border-radius: 999px; padding: 0.2rem 0.7rem; }
    .badge.green { background: rgba(34, 197, 94, 0.15); color: #86efac; }
    .badge.orange { background: rgba(245, 158, 11, 0.15); color: #fcd34d; }
    .badge.gray { background: #334155; color: #cbd5e1; }
    @media (max-width: 640px) {
        .shelf-grid { grid-template-columns: 1fr; }
        .history-row { gap: 0.5rem 0.75rem; padding: 0.85rem 1rem; }
    }
</style>
