<script>
    import { onMount } from 'svelte';
    import { enhance } from '$app/forms';
    import TerminalHeader from '$lib/components/TerminalHeader.svelte';
    import CameraScan from '$lib/components/CameraScan.svelte';
    import { numberLabels, duplicateCount } from '$lib/labelBuffer.js';

    export let data;

    $: shelves = data.shelves || [];
    $: hasDrawers = shelves.some((s) => s.drawers > 0);

    let scanInputRef;
    let scanInput = '';
    let checking = false;
    let checkError = '';
    let usedCamera = false;

    // Zwischenspeicher: alle geprüften Etiketten des Lagers, neueste zuerst (liegt auf dem Server)
    let labels = data.labels || [];
    let latest = null;       // { usage, labelId } der letzten Prüfung
    let bufferError = '';
    let confirmClear = false;
    let confirmTimer;
    $: numbered = numberLabels(labels);
    $: duplicates = duplicateCount(numbered);
    $: latestLabel = latest ? numbered.find((l) => l.id === latest.labelId) : null;
    $: sameAs = latestLabel?.sameAs || [];

    let shelfId = '';        // leer = alle Regale
    let ledBusy = false;
    let ledMessage = '';
    let ledFailed = false;

    // Hand-Scanner tippen ins Feld, darum kehrt der Fokus dorthin zurück.
    // Am Handy nicht: Dort würde die Tastatur das Ergebnis verdecken.
    function refocus() {
        if (usedCamera || window.matchMedia('(max-width: 600px)').matches) return;
        setTimeout(() => scanInputRef?.focus(), 100);
    }

    onMount(refocus);

    const checkBarcode = () => {
        checking = true;
        checkError = '';
        return async ({ result }) => {
            checking = false;
            if (result.type === 'success') {
                labels = result.data.labels;
                latest = { usage: result.data.usage, labelId: result.data.labelId };
            } else {
                checkError = result.data?.error || 'Die Prüfung ist fehlgeschlagen. Der Barcode gilt damit nicht als frei.';
            }
            scanInput = '';
            refocus();
        };
    };

    const bufferAction = () => {
        bufferError = '';
        return async ({ result }) => {
            confirmClear = false;
            if (result.data?.labels) labels = result.data.labels;
            // Eintrag der letzten Prüfung entfernt (z.B. doppelt gescannt): Ergebnis nicht mehr anzeigen
            if (latest && !labels.some((l) => l.id === latest.labelId)) latest = null;
            if (result.type !== 'success') bufferError = result.data?.error || 'Der Zwischenspeicher konnte nicht geändert werden.';
            refocus();
        };
    };

    // Leeren erst nach einer zweiten Bestätigung (gilt für alle Geräte des Lagers)
    function askClear() {
        confirmClear = true;
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(() => { confirmClear = false; }, 4000);
    }

    function formatTime(iso) {
        const date = new Date(iso);
        const time = date.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
        if (date.toDateString() === new Date().toDateString()) return time;
        return `${date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' })} ${time}`;
    }

    const labelNumbers = (numbers) => numbers.map((n) => `#${n}`).join(', ');

    const ledAction = () => {
        ledBusy = true;
        ledMessage = '';
        return async ({ result }) => {
            ledBusy = false;
            ledFailed = result.type !== 'success';
            ledMessage = result.data?.message || result.data?.error || (ledFailed ? 'Der Befehl konnte nicht gesendet werden.' : '');
            refocus();
        };
    };
</script>

<div class="terminal-page space-grotesk">
    <TerminalHeader title="Service" subtitle="Barcodes prüfen und LEDs testen" backHref="/terminal/settings" />

    <section class="service-card">
        <h2>Barcode prüfen</h2>
        <p class="intro">Scanne ein Etikett, bevor du es auf ein neues Fach klebst. Jedes geprüfte Etikett kommt in den Zwischenspeicher und wird mit den weiteren abgeglichen.</p>

        <form method="POST" action="?/checkBarcode" use:enhance={checkBarcode} class="check-form">
            <input
                bind:this={scanInputRef}
                bind:value={scanInput}
                type="text"
                name="barcode"
                placeholder="Barcode, z.B. A-01"
                aria-label="Barcode"
                autocomplete="off"
                required
            >
            <button type="submit" class="btn-check" disabled={checking}>{checking ? 'Prüfe…' : 'Prüfen'}</button>
        </form>
        <CameraScan input={scanInputRef} manualCapture on:scan={() => { usedCamera = true; }} />

        {#if checkError}
            <p class="check-error" role="alert">{checkError}</p>
        {/if}

        <div class="results" aria-live="polite">
            {#if latest}
                {@const result = latest.usage}
                <article class="result" class:free={result.free && sameAs.length === 0} class:duplicate={sameAs.length > 0}>
                    <div class="result-head">
                        <strong>{sameAs.length ? '⚠️ Doppelt' : result.free ? '✅ Frei' : '⚠️ Bereits vergeben'}</strong>
                        <code>{result.barcode}</code>
                    </div>
                    {#if sameAs.length}
                        <p class="duplicate-note">
                            Dieser Code ist schon im Zwischenspeicher: Etikett {labelNumbers(sameAs)}.
                            Hast du dasselbe Etikett zweimal gescannt, entferne den doppelten Eintrag unten.
                        </p>
                    {/if}
                    {#if result.free}
                        <p>Weder in einem Regal angelernt noch einem Artikel zugewiesen.</p>
                    {:else}
                        <ul>
                            {#each result.drawers as drawer}
                                <li>🗄️ {drawer.shelf} · LED #{drawer.ledIndex}</li>
                            {/each}
                            {#each result.articles as article}
                                <li>📦 {article.title}</li>
                            {/each}
                        </ul>
                        {#if result.drawers.length > 1}
                            <p>Dieser Barcode ist in mehreren Fächern angelernt.</p>
                        {/if}
                        {#if result.articles.length > 1}
                            <p>Dieser Barcode ist mehreren Artikeln zugewiesen.</p>
                        {/if}
                        {#if result.articles.length === 0}
                            <p>Im Regal angelernt, aber noch keinem Artikel zugewiesen.</p>
                        {:else if result.drawers.length === 0}
                            <p>Einem Artikel zugewiesen, aber in keinem Regal angelernt.</p>
                        {/if}
                        {#if result.drawers.length > 0}
                            <form method="POST" action="?/showDrawer" use:enhance={ledAction}>
                                <input type="hidden" name="barcode" value={result.barcode}>
                                <button type="submit" class="btn-show">💡 Fach zeigen</button>
                            </form>
                        {/if}
                    {/if}
                </article>
            {/if}
        </div>

        <div class="buffer">
            <div class="buffer-head">
                <h3>Zwischenspeicher</h3>
                <span class="buffer-count">
                    {labels.length} {labels.length === 1 ? 'Etikett' : 'Etiketten'}{#if duplicates > 0}<strong>{` · ${duplicates} doppelt`}</strong>{/if}
                </span>
                {#if labels.length > 0}
                    {#if confirmClear}
                        <form method="POST" action="?/clearLabels" use:enhance={bufferAction} class="clear-form">
                            <button type="submit" class="btn-clear danger">Wirklich leeren?</button>
                            <button type="button" class="btn-clear" on:click={() => { confirmClear = false; refocus(); }}>Abbrechen</button>
                        </form>
                    {:else}
                        <button type="button" class="btn-clear" on:click={askClear}>Leeren</button>
                    {/if}
                {/if}
            </div>
            {#if bufferError}
                <p class="check-error" role="alert">{bufferError}</p>
            {/if}
            {#if labels.length === 0}
                <p class="buffer-empty">Noch keine Etiketten geprüft.</p>
            {:else}
                <ol class="buffer-list">
                    {#each numbered as label (label.id)}
                        <li class:duplicate={label.sameAs.length > 0} class:taken={!label.free}>
                            <span class="label-number">#{label.number}</span>
                            <code>{label.code}</code>
                            <span class="label-state">
                                {label.sameAs.length ? `doppelt (${labelNumbers(label.sameAs)})` : label.free ? 'frei' : 'vergeben'}
                            </span>
                            <time datetime={label.at} title={label.by ? `geprüft von ${label.by}` : undefined}>{formatTime(label.at)}</time>
                            <form method="POST" action="?/forgetLabel" use:enhance={bufferAction}>
                                <input type="hidden" name="id" value={label.id}>
                                <button type="submit" class="btn-forget" aria-label="Etikett #{label.number} entfernen" title="Entfernen">✕</button>
                            </form>
                        </li>
                    {/each}
                </ol>
            {/if}
        </div>
    </section>

    <section class="service-card">
        <h2>LEDs testen</h2>
        {#if hasDrawers}
            <form method="POST" use:enhance={ledAction} class="led-form">
                {#if shelves.length > 1}
                    <label>
                        Regal
                        <select name="shelfId" bind:value={shelfId}>
                            <option value="">Alle Regale</option>
                            {#each shelves as shelf (shelf.id)}
                                <option value={shelf.id}>{shelf.name} ({shelf.drawers} Fächer)</option>
                            {/each}
                        </select>
                    </label>
                {/if}
                <div class="led-buttons">
                    <button type="submit" formaction="?/wave" class="btn-led" disabled={ledBusy || !data.waveReady}>
                        <span>⬇️ Lauflicht</span>
                        <small>Fächer blinken von oben nach unten durch</small>
                    </button>
                    <button type="submit" formaction="?/allBlue" class="btn-led" disabled={ledBusy}>
                        <span>🔵 Alle blau</span>
                        <small>Alle Fächer leuchten gleichzeitig</small>
                    </button>
                    <button type="submit" formaction="?/allOff" class="btn-led btn-off" disabled={ledBusy}>
                        <span>⏹️ Alle aus</span>
                        <small>Beendet auch das Lauflicht</small>
                    </button>
                </div>
            </form>
            {#if data.waveOutdated.length > 0 || !data.waveReady}
                <p class="update-note">
                    Für das Lauflicht braucht das Terminal die Software ab Version {data.waveMinVersion}{data.waveOutdated.length > 0 ? ` (noch nicht auf: ${data.waveOutdated.join(', ')})` : ''}.
                </p>
            {/if}
        {:else}
            <p class="intro">Noch keine Fächer angelernt.</p>
        {/if}
        {#if ledMessage}
            <p class="led-message" class:failed={ledFailed} role="status">{ledMessage}</p>
        {/if}
    </section>
</div>

<style>
    .terminal-page { max-width: 1000px; margin: 0 auto; }
    .service-card { background: #1e293b; border: 2px solid #334155; border-radius: 16px; padding: 1.5rem; margin-bottom: 1.5rem; }
    h2 { margin: 0 0 0.35rem; color: #f8fafc; font-size: 1.35rem; }
    .intro { margin: 0 0 1rem; color: #94a3b8; }

    .check-form { display: flex; gap: 0.75rem; }
    .check-form input { flex: 1; min-width: 0; background: #0f172a; color: #f8fafc; border: 1px solid #475569; border-radius: 10px; padding: 0.9rem 1rem; font-size: 1.1rem; font-family: monospace; }
    .check-form input:focus { outline: none; border-color: #3b82f6; }
    .btn-check { background: #3b82f6; color: #fff; border: none; border-radius: 10px; padding: 0.9rem 1.5rem; font-size: 1.05rem; font-weight: 700; font-family: inherit; cursor: pointer; }
    .btn-check:disabled { opacity: 0.6; cursor: wait; }
    .check-error { margin: 1rem 0 0; color: #fca5a5; }

    .results { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem; }
    .result { background: #0f172a; border: 2px solid #f59e0b; border-radius: 12px; padding: 1rem; color: #cbd5e1; }
    .result.free { border-color: #22c55e; }
    .result.duplicate { border-color: #ef4444; }
    .result-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.25rem 1rem; color: #f8fafc; font-size: 1.1rem; }
    .result-head code { color: #e2e8f0; background: none; font-size: 1.05rem; overflow-wrap: anywhere; }
    .result ul { list-style: none; margin: 0.6rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
    .result p { margin: 0.5rem 0 0; color: #94a3b8; }
    .duplicate-note { color: #fca5a5 !important; }

    .buffer { margin-top: 1.5rem; border-top: 1px solid #334155; padding-top: 1.25rem; }
    .buffer-head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1rem; }
    .buffer-head h3 { margin: 0; color: #f8fafc; font-size: 1.1rem; }
    .buffer-count { color: #94a3b8; flex: 1; }
    .buffer-count strong { color: #fca5a5; }
    .clear-form { display: flex; gap: 0.5rem; }
    .btn-clear { background: #0f172a; color: #e2e8f0; border: 1px solid #475569; border-radius: 8px; padding: 0.5rem 0.9rem; font-weight: 600; font-family: inherit; cursor: pointer; }
    .btn-clear.danger { background: #7f1d1d; border-color: #ef4444; color: #fff; }
    .buffer-empty { margin: 0.75rem 0 0; color: #94a3b8; }
    .buffer-list { list-style: none; margin: 0.75rem 0 0; padding: 0; max-height: 22rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.35rem; }
    .buffer-list li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto auto; align-items: center; gap: 0.75rem; background: #0f172a; border: 1px solid #334155; border-left: 4px solid #22c55e; border-radius: 8px; padding: 0.45rem 0.6rem; color: #cbd5e1; }
    .buffer-list li.taken { border-left-color: #f59e0b; }
    .buffer-list li.duplicate { border-color: #ef4444; border-left-color: #ef4444; background: #2a0f12; }
    .label-number { color: #64748b; font-size: 0.85rem; }
    .buffer-list code { color: #f8fafc; background: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .label-state { font-size: 0.85rem; }
    .duplicate .label-state { color: #fca5a5; font-weight: 700; }
    .buffer-list time { color: #64748b; font-size: 0.8rem; }
    .btn-forget { background: none; border: 1px solid #475569; color: #94a3b8; border-radius: 6px; width: 2rem; height: 2rem; cursor: pointer; font-family: inherit; }
    .btn-forget:hover { color: #fca5a5; border-color: #ef4444; }

    .btn-show { margin-top: 0.75rem; background: #1e293b; color: #e2e8f0; border: 1px solid #475569; border-radius: 8px; padding: 0.6rem 1rem; font-weight: 600; font-family: inherit; cursor: pointer; }

    .led-form label { display: flex; flex-direction: column; gap: 0.35rem; margin: 0.5rem 0 1rem; color: #94a3b8; }
    .led-form select { background: #0f172a; color: #f8fafc; border: 1px solid #475569; border-radius: 10px; padding: 0.8rem 1rem; font-size: 1rem; font-family: inherit; }
    .led-buttons { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; margin-top: 0.5rem; }
    .btn-led { display: flex; flex-direction: column; gap: 0.25rem; text-align: left; background: #0f172a; color: #f8fafc; border: 2px solid #3b82f6; border-radius: 12px; padding: 1rem; font-family: inherit; cursor: pointer; }
    .btn-led span { font-size: 1.1rem; font-weight: 700; }
    .btn-led small { color: #94a3b8; font-size: 0.85rem; }
    .btn-led.btn-off { border-color: #475569; }
    .btn-led:disabled { opacity: 0.5; cursor: not-allowed; }
    .update-note { margin: 1rem 0 0; color: #fbbf24; font-size: 0.95rem; }
    .led-message { margin: 1rem 0 0; color: #86efac; }
    .led-message.failed { color: #fca5a5; }

    @media (max-width: 600px) {
        .service-card { padding: 1rem; }
        .check-form { flex-direction: column; }
        .buffer-head h3 { flex: 1; }
        .buffer-count { order: 3; flex-basis: 100%; }
        .buffer-list li { grid-template-columns: auto minmax(0, 1fr) auto; }
        .buffer-list time { display: none; }
        .label-state { grid-column: 2; grid-row: 2; }
        .buffer-list form { grid-column: 3; grid-row: 1 / span 2; }
    }
</style>
