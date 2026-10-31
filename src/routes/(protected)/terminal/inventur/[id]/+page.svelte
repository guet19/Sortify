<script>
    // Inventur eines Regals: Fach für Fach wiegen (oder von Hand zählen), am Ende die Abweichungen übernehmen
    import { onMount, onDestroy } from 'svelte';
    import { enhance, deserialize } from '$app/forms';
    import { invalidateAll, beforeNavigate } from '$app/navigation';
    import TerminalHeader from '$lib/components/TerminalHeader.svelte';
    import { imageUrl } from '$lib/imageUrl.js';
    import { toCsv } from '$lib/csv.js';
    import { canWeigh, isCounted, deviation, nextOpenIndex, stocktakeSummary } from '$lib/stocktake.js';
    export let data;
    export let form;

    $: st = data.stocktake;
    $: items = st.items;
    $: isOpen = st.status === 'open';
    $: summary = stocktakeSummary(items);

    let index = 0;
    let view = 'count';     // 'count' | 'summary'
    let phase = 'ready';    // 'ready' | 'weighing' | 'manual' | 'result'
    let manualValue = '';
    let message = '';
    let lastResult = null;  // { counted, expected, diff }
    let litBarcode = null;
    let busy = false;
    let pollTimer;
    let manualInput;

    $: current = items[index];

    // Aktion dieser Seite aus dem Code aufrufen (ohne Formular)
    async function call(name, fields = {}) {
        const body = new FormData();
        for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) body.append(k, String(v));
        const res = await fetch(`?/${name}`, { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
        const result = deserialize(await res.text());
        if (result.type === 'failure') throw new Error(result.data?.error || 'Das hat nicht geklappt.');
        if (result.type !== 'success') throw new Error('Serverfehler. Bitte erneut versuchen.');
        return result.data || {};
    }

    async function goTo(i) {
        clearTimeout(pollTimer);
        index = i;
        view = 'count';
        phase = 'ready';
        manualValue = '';
        message = '';
        lastResult = null;
        const barcode = items[i].barcode;
        try {
            await call('focus', { barcode, previous: litBarcode });
            litBarcode = barcode;
        } catch { /* LED ist nur eine Hilfe */ }
    }

    function lightsOff() {
        if (!litBarcode) return;
        const body = new FormData();
        body.append('barcode', litBarcode);
        litBarcode = null;
        fetch('?/ledsOff', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' }, keepalive: true }).catch(() => {});
    }

    function waitForWeight(requestId) {
        return new Promise((resolve, reject) => {
            const started = Date.now();
            const tick = async () => {
                try {
                    const res = await fetch(`/api/scale/${requestId}`, { cache: 'no-store' });
                    const d = await res.json();
                    if (d.status === 'done' && d.weight !== null && d.weight !== undefined) return resolve(d.weight);
                    if (d.status === 'error') return reject(new Error('Die Waage meldet einen Fehler.'));
                } catch { /* kurzer Netzaussetzer */ }
                if (Date.now() - started > 20000) return reject(new Error('Die Waage antwortet nicht. Ist das Terminal eingeschaltet?'));
                pollTimer = setTimeout(tick, 700);
            };
            tick();
        });
    }

    async function save(fields) {
        const { result } = await call('count', { barcode: current.barcode, ...fields });
        lastResult = result;
        phase = 'result';
        await invalidateAll();
    }

    async function weigh() {
        phase = 'weighing';
        message = '';
        try {
            const { requestId } = await call('weigh', { barcode: current.barcode });
            await save({ weight: await waitForWeight(requestId) });
        } catch (e) {
            phase = 'ready';
            message = e.message;
        }
    }

    async function saveManual() {
        busy = true;
        message = '';
        try {
            await save({ counted: manualValue });
        } catch (e) {
            message = e.message;
        } finally {
            busy = false;
        }
    }

    async function startManual() {
        phase = 'manual';
        manualValue = lastResult ? String(lastResult.counted) : '';
        await Promise.resolve();
        setTimeout(() => manualInput?.focus(), 50);
    }

    async function skip() {
        busy = true;
        try {
            await call('skip', { barcode: current.barcode });
            await invalidateAll();
            next();
        } catch (e) {
            message = e.message;
        } finally {
            busy = false;
        }
    }

    function next() {
        const n = nextOpenIndex(items, index + 1);
        if (n === -1) showSummary();
        else goTo(n);
    }

    function showSummary() {
        clearTimeout(pollTimer);
        lightsOff();
        view = 'summary';
    }

    onMount(() => {
        if (!isOpen) return (view = 'summary');
        const n = nextOpenIndex(items, 0);
        if (n === -1) showSummary();
        else goTo(n);
    });
    beforeNavigate(() => lightsOff());
    onDestroy(() => clearTimeout(pollTimer));

    const qty = (n) => Number(n).toLocaleString('de-CH');
    const signed = (n) => (n > 0 ? `+${qty(n)}` : qty(n));
    const chf = (v) => (v === null || v === undefined ? '–' : `${v > 0 ? '+' : ''}${v.toFixed(2)} CHF`);
    const day = (iso) => new Date(iso).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' });
    const itemState = (i) => (i.skipped ? 'skipped' : !isCounted(i) ? 'open' : deviation(i) !== 0 ? 'deviation' : 'ok');

    function exportCsv() {
        const rows = [['Fach', 'Artikel', 'Laut Sortify', 'Gezählt', 'Abweichung', 'Stückpreis (CHF)', 'Wert der Abweichung (CHF)', 'Methode', 'Gezählt am']];
        for (const i of items) {
            const diff = isCounted(i) ? deviation(i) : '';
            rows.push([i.barcode, i.articleTitle, i.expected ?? '', i.skipped ? 'übersprungen' : (i.counted ?? ''), diff,
                i.price !== null ? i.price.toFixed(2) : '', i.price !== null && diff !== '' ? (diff * i.price).toFixed(2) : '',
                i.method === 'weighed' ? 'gewogen' : i.method === 'manual' ? 'von Hand' : '', i.countedAt ? day(i.countedAt) : '']);
        }
        const a = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })),
            download: `Inventur_${st.shelfName.replace(/[^\w-]+/g, '_')}_${st.startedAt.slice(0, 10)}.csv`
        });
        document.body.appendChild(a); a.click(); a.remove();
    }

    const submitting = (question) => ({ cancel }) => {
        if (question && !confirm(question)) return cancel();
        busy = true;
        return async ({ update }) => { await update(); busy = false; };
    };
</script>

<div class="terminal-page space-grotesk">
    <TerminalHeader title="Inventur: {st.shelfName}" subtitle="Begonnen {day(st.startedAt)}{st.startedBy ? ` von ${st.startedBy}` : ''}" backHref="/terminal/inventur" />

    <div class="st-progress" aria-label="Fortschritt">
        <div class="st-progress-bar"><span style="width: {summary.total ? ((summary.counted + summary.skipped) / summary.total) * 100 : 0}%"></span></div>
        <span>{summary.counted + summary.skipped} von {summary.total} Fächern erledigt{summary.deviations.length ? ` · ${summary.deviations.length} Abweichungen` : ''}</span>
    </div>

    {#if view === 'count' && current}
        <section class="st-card">
            <div class="drawer-head">
                <span class="drawer-code">{current.barcode}</span>
                <span class="drawer-pos">Fach {index + 1} von {items.length}</span>
            </div>
            <div class="article">
                <div class="thumb">{#if current.imagePath}<img src={imageUrl(current.imagePath, 240)} alt="" />{:else}📦{/if}</div>
                <h2>{current.articleTitle}</h2>
            </div>

            {#if phase === 'ready' || phase === 'weighing'}
                <p class="hint">💡 Das Fach leuchtet. Kiste entnehmen und auf die Waage stellen.</p>
                {#if !canWeigh(current)}
                    <p class="note">Für dieses Fach sind Leergewicht oder Stückgewicht nicht hinterlegt – bitte von Hand zählen.</p>
                {/if}
                <div class="button-row">
                    <button type="button" class="big-btn blue" on:click={weigh} disabled={!canWeigh(current) || phase === 'weighing'}>
                        {#if phase === 'weighing'}<span class="spinner"></span> Waage misst…{:else}⚖️ Wiegen{/if}
                    </button>
                    <button type="button" class="big-btn" class:primary={!canWeigh(current)} on:click={startManual} disabled={phase === 'weighing'}>✍️ Von Hand zählen</button>
                </div>
                <button type="button" class="link-btn" on:click={skip} disabled={busy || phase === 'weighing'}>Fach überspringen</button>
            {:else if phase === 'manual'}
                <form class="manual-form" on:submit|preventDefault={saveManual}>
                    <label for="manual-count">Gezählte Menge</label>
                    <input id="manual-count" bind:this={manualInput} bind:value={manualValue} type="number" min="0" step="1" inputmode="numeric" required />
                    <div class="button-row">
                        <button type="submit" class="big-btn green" disabled={busy || manualValue === ''}>Speichern</button>
                        <button type="button" class="big-btn" on:click={() => (phase = lastResult ? 'result' : 'ready')}>Abbrechen</button>
                    </div>
                </form>
            {:else if phase === 'result' && lastResult}
                <div class="result" class:ok={lastResult.diff === 0} class:off={lastResult.diff !== 0}>
                    <div class="result-count">{qty(lastResult.counted)} Stk.</div>
                    <div class="result-compare">
                        Laut Sortify {qty(lastResult.expected)} Stk. ·
                        {#if lastResult.diff === 0}<strong>stimmt</strong>{:else}<strong>Abweichung {signed(lastResult.diff)}</strong>{/if}
                    </div>
                </div>
                <div class="button-row">
                    <button type="button" class="big-btn green" on:click={next}>Weiter →</button>
                    {#if canWeigh(current)}<button type="button" class="big-btn" on:click={weigh}>Nochmal wiegen</button>{/if}
                    <button type="button" class="big-btn" on:click={startManual}>Korrigieren</button>
                </div>
            {/if}
            {#if message}<p class="error-text" role="alert">{message}</p>{/if}
        </section>

        <div class="chips" aria-label="Alle Fächer">
            {#each items as item, i (item.barcode)}
                <button type="button" class="chip {itemState(item)}" class:current={i === index} on:click={() => goTo(i)} title={item.articleTitle}>
                    {item.barcode}
                </button>
            {/each}
        </div>
        <div class="footer-row">
            <button type="button" class="big-btn outline" on:click={showSummary}>Zur Auswertung{summary.open ? ` (${summary.open} offen)` : ''}</button>
        </div>
    {:else}
        <!-- Auswertung -->
        {#if form?.applied}
            <div class="banner success" role="status">✅ {form.applied.booked} {form.applied.booked === 1 ? 'Bestand' : 'Bestände'} korrigiert.{form.applied.failed.length ? ` Nicht gebucht: ${form.applied.failed.join(', ')}` : ''}</div>
        {:else if st.status === 'done'}
            <div class="banner success">Abweichungen übernommen am {day(st.finishedAt)}.</div>
        {:else if st.status === 'discarded'}
            <div class="banner gray">Verworfen am {day(st.finishedAt)} – keine Bestände geändert.</div>
        {/if}
        {#if form?.error}<div class="banner error" role="alert">{form.error}</div>{/if}

        <section class="st-card summary-card">
            <h2>Abweichungen</h2>
            <div class="kpis">
                <div><strong>{summary.matching}</strong><span>stimmen</span></div>
                <div class:warn={summary.deviations.length}><strong>{summary.deviations.length}</strong><span>Abweichungen</span></div>
                <div><strong>{summary.skipped}</strong><span>übersprungen</span></div>
                <div class:warn={summary.valueDelta !== 0}><strong>{chf(summary.valueDelta)}</strong><span>Wertdifferenz</span></div>
            </div>

            {#if isOpen && summary.open}
                <div class="banner info">
                    Noch {summary.open} {summary.open === 1 ? 'Fach' : 'Fächer'} offen.
                    <button type="button" class="link-btn inline" on:click={() => goTo(nextOpenIndex(items, 0))}>Weiterzählen</button>
                </div>
            {/if}

            {#if summary.deviations.length}
                <div class="table-wrap">
                    <table class="deviation-table">
                        <thead><tr><th>Fach</th><th>Artikel</th><th class="num">Sortify</th><th class="num">Gezählt</th><th class="num">Abweichung</th><th class="num">Wert</th></tr></thead>
                        <tbody>
                            {#each summary.deviations as d (d.barcode)}
                                <tr>
                                    <td class="mono">{d.barcode}</td>
                                    <td class="title-cell">{d.articleTitle}{#if d.applyError}<div class="apply-error">{d.applyError}</div>{/if}</td>
                                    <td class="num" data-label="Sortify">{qty(d.expected)}</td>
                                    <td class="num" data-label="Gezählt">{qty(d.counted)}</td>
                                    <td class="num diff" data-label="Abweichung" class:minus={d.diff < 0} class:plus={d.diff > 0}>{signed(d.diff)}</td>
                                    <td class="num" data-label="Wert">{chf(d.value)}</td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {:else if summary.counted}
                <p class="all-good">🎉 Alle gezählten Fächer stimmen mit Sortify überein.</p>
            {/if}

            {#if summary.skipped}
                <p class="muted">Übersprungen: {items.filter((i) => i.skipped).map((i) => i.barcode).join(', ')}</p>
            {/if}

            <div class="button-row">
                {#if isOpen}
                    <form method="POST" action="?/apply" use:enhance={submitting(summary.deviations.length ? `${summary.deviations.length} Bestände jetzt korrigieren?` : 'Inventur abschliessen?')}>
                        <button type="submit" class="big-btn green" disabled={busy || summary.counted === 0}>
                            {summary.deviations.length ? 'Abweichungen übernehmen' : 'Inventur abschliessen'}
                        </button>
                    </form>
                    <form method="POST" action="?/discard" use:enhance={submitting('Inventur verwerfen? Es werden keine Bestände geändert.')}>
                        <button type="submit" class="big-btn" disabled={busy}>Verwerfen</button>
                    </form>
                {/if}
                <button type="button" class="big-btn outline" on:click={exportCsv}>CSV exportieren</button>
            </div>
            {#if isOpen && summary.deviations.length}
                <p class="muted small">Beim Übernehmen wird jedes Fach auf die gezählte Menge gesetzt. Bewegungen seit dem Zählen (z.B. Entnahmen) bleiben erhalten.</p>
            {/if}
        </section>
    {/if}
</div>

<style>
    .terminal-page { max-width: 1000px; margin: 0 auto; color: #f8fafc; }
    .st-progress { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; color: #94a3b8; font-weight: 600; flex-wrap: wrap; }
    .st-progress-bar { flex: 1 1 200px; height: 10px; background: #1e293b; border-radius: 999px; overflow: hidden; border: 1px solid #334155; }
    .st-progress-bar span { display: block; height: 100%; background: #22c55e; transition: width 0.3s; }

    /* eigene Klassennamen, weil Bootstrap "card" und "progress" schon belegt */
    .st-card { background: #1e293b; border: 2px solid #334155; border-radius: 16px; padding: 2rem; color: #f8fafc; }
    .drawer-head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
    .drawer-code { font-family: monospace; font-size: 2.2rem; font-weight: 700; color: #38bdf8; }
    .drawer-pos { color: #94a3b8; font-weight: 600; }
    .article { display: flex; align-items: center; gap: 1.25rem; margin: 1.25rem 0; }
    .thumb { width: 96px; height: 72px; flex: none; background: #fff; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 2rem; overflow: hidden; }
    .thumb img { width: 100%; height: 100%; object-fit: contain; }
    .article h2 { margin: 0; font-size: 1.6rem; line-height: 1.3; }
    .hint { color: #cbd5e1; font-size: 1.1rem; margin: 0 0 1rem 0; }
    .note { background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.5); color: #fcd34d; border-radius: 10px; padding: 0.75rem 1rem; margin: 0 0 1rem 0; font-weight: 600; }
    .button-row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .button-row form { display: contents; }
    .big-btn { flex: 1 1 200px; min-height: 64px; border-radius: 12px; border: 2px solid #475569; background: #0f172a; color: #f8fafc; font-size: 1.15rem; font-weight: 700; cursor: pointer; font-family: inherit; display: inline-flex; align-items: center; justify-content: center; gap: 0.6rem; padding: 0 1.25rem; }
    .big-btn.blue, .big-btn.primary { background: #3b82f6; border-color: #3b82f6; color: #fff; }
    .big-btn.green { background: #22c55e; border-color: #22c55e; color: #052e16; }
    .big-btn.outline { background: transparent; border-color: #3b82f6; color: #93c5fd; }
    .big-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .link-btn { background: none; border: none; color: #94a3b8; font-weight: 600; cursor: pointer; font-family: inherit; font-size: 1rem; margin-top: 1rem; padding: 0.5rem 0; }
    .link-btn:hover:not(:disabled) { color: #f8fafc; }
    .link-btn.inline { margin: 0 0 0 0.5rem; padding: 0; color: #93c5fd; }
    .manual-form { display: flex; flex-direction: column; gap: 0.75rem; }
    .manual-form label { color: #94a3b8; font-weight: 600; }
    .manual-form input { font-size: 2rem; padding: 0.75rem 1rem; border-radius: 12px; border: 2px solid #3b82f6; background: #0f172a; color: #fff; font-family: inherit; max-width: 240px; }
    .result { border-radius: 14px; padding: 1.25rem 1.5rem; margin-bottom: 1rem; }
    .result.ok { background: rgba(34, 197, 94, 0.12); border: 2px solid #22c55e; }
    .result.off { background: rgba(245, 158, 11, 0.12); border: 2px solid #f59e0b; }
    .result-count { font-size: 2.6rem; font-weight: 800; }
    .result-compare { color: #cbd5e1; font-size: 1.1rem; }
    .result.off strong { color: #fcd34d; }
    .result.ok strong { color: #86efac; }
    .error-text { color: #fca5a5; font-weight: 600; margin: 1rem 0 0 0; }
    .spinner { width: 20px; height: 20px; border: 3px solid rgba(255, 255, 255, 0.35); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } .st-progress-bar span { transition: none; } }

    .chips { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 1.5rem 0; }
    .chip { font-family: monospace; font-size: 0.95rem; font-weight: 700; border-radius: 8px; padding: 0.5rem 0.75rem; border: 2px solid #334155; background: #0f172a; color: #94a3b8; cursor: pointer; }
    .chip.ok { border-color: #22c55e; color: #86efac; }
    .chip.deviation { border-color: #f59e0b; color: #fcd34d; }
    .chip.skipped { border-style: dashed; color: #64748b; }
    .chip.current { background: #1d4ed8; border-color: #60a5fa; color: #fff; }
    .footer-row { display: flex; }

    .banner { border-radius: 12px; padding: 1rem 1.25rem; margin-bottom: 1rem; font-weight: 600; }
    .banner.success { background: rgba(34, 197, 94, 0.12); border: 1px solid #22c55e; color: #bbf7d0; }
    .banner.gray { background: #1e293b; border: 1px solid #475569; color: #cbd5e1; }
    .banner.error { background: rgba(239, 68, 68, 0.12); border: 1px solid #ef4444; color: #fecaca; }
    .banner.info { background: rgba(59, 130, 246, 0.12); border: 1px solid #3b82f6; color: #bfdbfe; }
    .summary-card h2 { margin: 0 0 1rem 0; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.75rem; margin-bottom: 1.25rem; }
    .kpis div { background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 0.85rem 1rem; display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
    .kpis strong { font-size: 1.5rem; overflow-wrap: anywhere; }
    .kpis span { color: #94a3b8; font-weight: 600; font-size: 0.9rem; }
    .kpis .warn strong { color: #fcd34d; }
    .table-wrap { overflow-x: auto; margin-bottom: 1rem; }
    table { width: 100%; border-collapse: collapse; font-size: 1rem; }
    th { text-align: left; color: #94a3b8; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.6rem; border-bottom: 1px solid #334155; white-space: nowrap; }
    td { padding: 0.7rem 0.6rem; border-bottom: 1px solid #1e3a5f; vertical-align: top; }
    .num { text-align: right; white-space: nowrap; }
    .mono { font-family: monospace; font-weight: 700; color: #38bdf8; white-space: nowrap; }
    .diff.minus { color: #fca5a5; font-weight: 700; }
    .diff.plus { color: #86efac; font-weight: 700; }
    .apply-error { color: #fca5a5; font-size: 0.85rem; font-weight: 600; }
    .all-good { font-size: 1.15rem; color: #86efac; font-weight: 600; }
    .muted { color: #94a3b8; }
    .small { font-size: 0.9rem; margin-top: 1rem; }

    @media (max-width: 640px) {
        .st-card { padding: 1.25rem; }
        .drawer-code { font-size: 1.7rem; }
        .article h2 { font-size: 1.25rem; }
        .thumb { width: 72px; height: 54px; }
        .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        /* Abweichungen als gestapelte Zeilen statt breiter Tabelle */
        .deviation-table thead { display: none; }
        .deviation-table, .deviation-table tbody { display: block; }
        .deviation-table tr { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 0.8fr) minmax(0, 1fr) minmax(0, 1.3fr); gap: 0.35rem 0.5rem; padding: 0.75rem 0; border-bottom: 1px solid #1e3a5f; }
        .deviation-table td { border: none; padding: 0; text-align: left; white-space: normal; overflow-wrap: anywhere; }
        .deviation-table .mono { grid-column: 1 / 2; }
        .deviation-table .title-cell { grid-column: 2 / 5; }
        .deviation-table td[data-label]::before { content: attr(data-label); display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.03em; color: #94a3b8; font-weight: 600; }
        .big-btn { flex-basis: 100%; min-height: 56px; }
    }
</style>
