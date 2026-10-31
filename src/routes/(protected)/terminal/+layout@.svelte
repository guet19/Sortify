<script>
    import { beforeNavigate, afterNavigate, invalidateAll } from '$app/navigation';
    import { page } from '$app/stores';
    import { onMount } from 'svelte';
    export let data;

    // --- Verbindung zum Terminal (Raspberry Pi) ---
    // Der Server pingt das Terminal bei Bedarf per MQTT an; es antwortet per HTTPS.
    // Abgefragt wird nur, solange die Seite sichtbar ist.
    const STATUS = {
        online:   { label: 'Sync aktiv', hint: 'Das Terminal ist verbunden.' },
        checking: { label: 'Prüfe…', hint: 'Verbindung zum Terminal wird geprüft.' },
        offline:  { label: 'Terminal offline', hint: 'Das Terminal antwortet nicht. LEDs und Waage reagieren erst wieder, wenn es verbunden ist.' },
        unpaired: { label: 'Kein Terminal', hint: 'Mit diesem Lager ist noch kein Terminal gekoppelt.' },
        choose:   { label: 'Terminal wählen', hint: 'Dieses Lager hat mehrere Terminals. Bitte wählen, an welchem dieser Browser steht.' },
        unknown:  { label: 'Status unbekannt', hint: 'Der Verbindungsstatus lässt sich gerade nicht ermitteln.' }
    };
    let status = { state: 'checking' };
    let statusTimer;

    // fresh = beim Öffnen, Klick oder Zurückkehren zum Tab: das Terminal jetzt wirklich anpingen
    async function checkStatus(fresh = false) {
        clearTimeout(statusTimer);
        if (fresh && status.state !== 'unpaired') status = { ...status, state: 'checking' };
        try {
            const res = await fetch(`/api/terminal-status${fresh ? '?fresh=1' : ''}`, { cache: 'no-store' });
            status = res.ok ? await res.json() : { state: 'unknown' };
        } catch {
            status = { state: 'unknown' }; // eigenes Netzwerk weg
        }
        if (!document.hidden) statusTimer = setTimeout(checkStatus, status.state === 'checking' ? 2500 : 45000);
    }

    onMount(() => {
        checkStatus(true);
        const onVisibility = () => (document.hidden ? clearTimeout(statusTimer) : checkStatus(true));
        document.addEventListener('visibilitychange', onVisibility);
        return () => { clearTimeout(statusTimer); document.removeEventListener('visibilitychange', onVisibility); };
    });

    // --- Mehrere Terminals: An welchem steht dieser Browser? ---
    $: terminals = data.terminals || [];
    $: currentTerminal = terminals.find((t) => t.id === data.currentTerminalId) || null;
    $: needsChoice = terminals.length > 1 && !currentTerminal;
    // Diese Seiten wiegen oder kalibrieren und brauchen deshalb ein eindeutiges Terminal
    const SCALE_PAGES = ['/terminal/return', '/terminal/inventur', '/terminal/settings/assign', '/terminal/settings/scale',
        '/terminal/settings/calibration', '/terminal/settings/maintenance', '/terminal/settings/shelf'];
    $: blocksContent = needsChoice && SCALE_PAGES.some((p) => $page.url.pathname === p || $page.url.pathname.startsWith(p + '/'));
    let choosing = false;
    let chooseError = '';

    async function chooseTerminal(id) {
        chooseError = '';
        const res = await fetch('/api/terminal-select', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ terminalId: id }) });
        if (!res.ok) { chooseError = 'Das Terminal wurde nicht gefunden. Bitte Seite neu laden.'; return; }
        choosing = false;
        await invalidateAll();
        checkStatus(true);
    }

    $: info = STATUS[status.state] || STATUS.unknown;
    $: lastSeen = status.lastSeenAt ? new Date(status.lastSeenAt).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' }) : null;
    $: title = [info.hint, lastSeen && status.state !== 'online' ? `Zuletzt gemeldet: ${lastSeen}` : '', status.outdated ? 'Hinweis: Terminal-Software veraltet – Status nur ungefähr.' : '']
        .filter(Boolean).join(' ');

    // Im Terminal scrollt nicht das Fenster, sondern dieser Bereich – SvelteKit setzt ihn
    // beim Seitenwechsel nicht zurück. Deshalb: neue Seite immer oben öffnen,
    // beim Zurückgehen zur Liste die vorherige Position wiederherstellen.
    let contentEl;
    const scrollPositions = new Map();

    beforeNavigate(({ from }) => {
        if (contentEl && from?.url) scrollPositions.set(from.url.pathname, contentEl.scrollTop);
    });

    afterNavigate(({ from, to, type }) => {
        if (!contentEl || !to?.url) return;
        const backToSearch = to.url.pathname === '/terminal/search' && from?.url.pathname.startsWith('/terminal/search/');
        contentEl.scrollTop = (type === 'popstate' || backToSearch) ? (scrollPositions.get(to.url.pathname) ?? 0) : 0;
    });
</script>

<div class="terminal-viewport">
    <header class="terminal-header">
        <div class="branding">
            <!-- Das Logo fungiert gleichzeitig als Home-Button -->
            <a href="/terminal" class="home-link">
                <h1>Sortify <span class="badge">TERMINAL</span></h1>
            </a>
        </div>
        
        <div class="system-status">
            {#if status.state === 'unpaired'}
                <a href="/terminal/settings/pairing" class="status-indicator" title={title} aria-label="{info.label}: {info.hint}">
                    <span class="dot {status.state}"></span>
                    <span class="status-text">{info.label}</span>
                </a>
            {:else}
                {#if terminals.length > 1}
                    <button type="button" class="terminal-name" on:click={() => (choosing = !choosing)} aria-expanded={choosing} title="Anderes Terminal wählen">
                        {currentTerminal ? currentTerminal.name : 'Terminal wählen'} <span aria-hidden="true">▾</span>
                    </button>
                {/if}
                {#if status.state !== 'choose'}
                    <button type="button" class="status-indicator" on:click={() => checkStatus(true)} title="{title} Klicken zum erneuten Prüfen." aria-label="{info.label}: {info.hint} Erneut prüfen">
                        <span class="dot {status.state}"></span>
                        <span class="status-text">{info.label}</span>
                    </button>
                {/if}
            {/if}
            
            <!-- NEU: Das kleine Zahnrad-Symbol oben rechts -->
            <a href="/terminal/settings" class="settings-btn" aria-label="Einstellungen">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
            </a>
        </div>
    </header>

    {#if needsChoice || choosing}
        <section class="terminal-chooser" aria-labelledby="chooser-title">
            <h2 id="chooser-title">{needsChoice ? 'An welchem Terminal stehst du?' : 'Terminal wechseln'}</h2>
            <p>Dieses Lager hat {terminals.length} Terminals. Wiegen und Kalibrieren laufen über das gewählte Terminal. Die Wahl gilt für diesen Browser.</p>
            <div class="chooser-buttons">
                {#each terminals as t (t.id)}
                    <button type="button" class="chooser-btn" class:active={t.id === currentTerminal?.id} on:click={() => chooseTerminal(t.id)}>{t.name}</button>
                {/each}
            </div>
            {#if chooseError}<p class="chooser-error" role="alert">{chooseError}</p>{/if}
            {#if !needsChoice}<button type="button" class="chooser-close" on:click={() => (choosing = false)}>Abbrechen</button>{/if}
        </section>
    {/if}

    {#if status.state === 'offline'}
        <div class="offline-banner" role="status">
            Das Terminal ist nicht erreichbar{lastSeen ? ` (zuletzt gemeldet ${lastSeen})` : ''}. LEDs und Waage reagieren erst wieder, wenn es verbunden ist.
        </div>
    {/if}

    <main class="terminal-content" bind:this={contentEl}>
        {#if blocksContent}
            <p class="blocked-hint">Bitte zuerst oben das Terminal wählen – erst dann ist klar, welche Waage misst.</p>
        {:else}
            <slot />
        {/if}
    </main>
</div>

<style>
    :global(body) { margin: 0; padding: 0; background-color: #0f172a; color: #f8fafc; font-family: system-ui, sans-serif; }
    .terminal-viewport { display: flex; flex-direction: column; height: 100vh; height: 100dvh; overflow: hidden; }
    .terminal-header { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem 2rem; background-color: #1e293b; border-bottom: 2px solid #334155; }
    
    .home-link { text-decoration: none; color: inherit; }
    .branding h1 { margin: 0; font-size: 1.8rem; display: flex; align-items: center; gap: 1rem; }
    .badge { font-size: 0.9rem; background-color: #3b82f6; padding: 0.3rem 0.8rem; border-radius: 8px; letter-spacing: 2px; }
    
    .system-status { display: flex; align-items: center; gap: 2rem; }
    .status-indicator { display: flex; align-items: center; gap: 0.8rem; font-weight: 600; color: #94a3b8; background: none; border: none; padding: 0.4rem; margin: -0.4rem; border-radius: 8px; cursor: pointer; font-family: inherit; font-size: 1rem; text-decoration: none; }
    .status-indicator:hover, .status-indicator:focus-visible { color: #e2e8f0; background: rgba(148, 163, 184, 0.1); }
    .dot { width: 12px; height: 12px; border-radius: 50%; flex: none; }
    .dot.online { background-color: #22c55e; box-shadow: 0 0 10px #22c55e; }
    .dot.offline { background-color: #ef4444; box-shadow: 0 0 10px #ef4444; }
    .dot.checking { background-color: #f59e0b; box-shadow: 0 0 8px #f59e0b; animation: pulse 1.2s ease-in-out infinite; }
    .dot.unpaired, .dot.unknown { background-color: #64748b; }
    @keyframes pulse { 50% { opacity: 0.35; } }
    @media (prefers-reduced-motion: reduce) { .dot.checking { animation: none; } }
    .terminal-name { background: rgba(59, 130, 246, 0.12); border: 1px solid #3b82f6; color: #bfdbfe; border-radius: 10px; padding: 0.45rem 0.85rem; font-weight: 700; font-size: 0.95rem; cursor: pointer; font-family: inherit; max-width: 14rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .terminal-name:hover { background: rgba(59, 130, 246, 0.22); }
    .terminal-chooser { background: #172554; border-bottom: 2px solid #3b82f6; padding: 1.25rem 2rem; }
    .terminal-chooser h2 { margin: 0 0 0.35rem 0; font-size: 1.35rem; }
    .terminal-chooser p { margin: 0 0 1rem 0; color: #bfdbfe; }
    .chooser-buttons { display: flex; flex-wrap: wrap; gap: 0.75rem; }
    .chooser-btn { min-height: 56px; padding: 0.75rem 1.5rem; border-radius: 12px; border: 2px solid #3b82f6; background: #1e3a8a; color: #fff; font-size: 1.1rem; font-weight: 700; cursor: pointer; font-family: inherit; }
    .chooser-btn:hover, .chooser-btn.active { background: #2563eb; }
    .chooser-close { margin-top: 0.85rem; background: none; border: none; color: #93c5fd; font-weight: 600; cursor: pointer; font-family: inherit; font-size: 0.95rem; padding: 0.25rem 0; }
    .chooser-error { color: #fecaca !important; font-weight: 600; margin-top: 0.75rem !important; }
    .blocked-hint { color: #94a3b8; font-size: 1.1rem; text-align: center; margin-top: 3rem; }
    .offline-banner { background: rgba(239, 68, 68, 0.12); border-bottom: 1px solid #ef4444; color: #fecaca; padding: 0.6rem 2rem; font-size: 0.95rem; font-weight: 600; }

    /* Touch-freundlicher Settings-Button */
    .settings-btn {
        background: transparent;
        color: #94a3b8;
        border: 1px solid #475569;
        border-radius: 12px;
        width: 54px;
        height: 54px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }
    .settings-btn:hover, .settings-btn:active { background-color: #334155; color: #fff; border-color: #3b82f6; }
    
    .terminal-content { flex: 1; padding: 2rem; overflow-y: auto; overflow-x: hidden; min-width: 0; }

    /* ===== Smartphone ===== */
    @media (max-width: 640px) {
        .terminal-header { padding: 0.75rem 1rem; gap: 0.75rem; }
        .branding h1 { font-size: 1.3rem; gap: 0.5rem; }
        .badge { font-size: 0.65rem; padding: 0.2rem 0.5rem; letter-spacing: 1px; }
        .system-status { gap: 0.75rem; }
        .status-text { display: none; } /* Der farbige Punkt reicht als Status */
        .settings-btn { width: 44px; height: 44px; border-radius: 10px; }
        .settings-btn svg { width: 22px; height: 22px; }
        .terminal-content { padding: 1rem; }
        .offline-banner { padding: 0.5rem 1rem; font-size: 0.85rem; }
        .terminal-name { max-width: 8rem; padding: 0.35rem 0.6rem; font-size: 0.85rem; }
        .terminal-chooser { padding: 1rem; }
        .chooser-btn { flex: 1 1 100%; }
    }
</style>