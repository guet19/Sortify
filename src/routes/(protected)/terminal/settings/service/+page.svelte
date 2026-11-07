<script>
    import { onMount } from 'svelte';
    import { enhance } from '$app/forms';
    import TerminalHeader from '$lib/components/TerminalHeader.svelte';
    import CameraScan from '$lib/components/CameraScan.svelte';

    export let data;

    const MAX_RESULTS = 20;

    $: shelves = data.shelves || [];
    $: hasDrawers = shelves.some((s) => s.drawers > 0);

    let scanInputRef;
    let scanInput = '';
    let checking = false;
    let checkError = '';
    let results = [];        // neuestes Ergebnis zuerst
    let usedCamera = false;

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
                const { usage } = result.data;
                const same = usage.barcode.toLowerCase();
                results = [usage, ...results.filter((r) => r.barcode.toLowerCase() !== same)].slice(0, MAX_RESULTS);
            } else {
                checkError = result.data?.error || 'Die Prüfung ist fehlgeschlagen. Der Barcode gilt damit nicht als frei.';
            }
            scanInput = '';
            refocus();
        };
    };

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
        <p class="intro">Scanne ein Etikett, bevor du es auf ein neues Fach klebst.</p>

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
            {#each results as result (result.barcode)}
                <article class="result" class:free={result.free}>
                    <div class="result-head">
                        <strong>{result.free ? '✅ Frei' : '⚠️ Bereits vergeben'}</strong>
                        <code>{result.barcode}</code>
                    </div>
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
            {/each}
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
    .result-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.25rem 1rem; color: #f8fafc; font-size: 1.1rem; }
    .result-head code { color: #e2e8f0; background: none; font-size: 1.05rem; overflow-wrap: anywhere; }
    .result ul { list-style: none; margin: 0.6rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
    .result p { margin: 0.5rem 0 0; color: #94a3b8; }
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
    }
</style>
