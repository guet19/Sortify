<script>
    import { beforeNavigate, afterNavigate } from '$app/navigation';
    import { onMount } from 'svelte';

    // --- Verbindung zum Terminal (Raspberry Pi) ---
    // Der Server pingt das Terminal bei Bedarf per MQTT an; es antwortet per HTTPS.
    // Abgefragt wird nur, solange die Seite sichtbar ist.
    const STATUS = {
        online:   { label: 'Sync aktiv', hint: 'Das Terminal ist verbunden.' },
        checking: { label: 'Prüfe…', hint: 'Verbindung zum Terminal wird geprüft.' },
        offline:  { label: 'Terminal offline', hint: 'Das Terminal antwortet nicht. LEDs und Waage reagieren erst wieder, wenn es verbunden ist.' },
        unpaired: { label: 'Kein Terminal', hint: 'Mit diesem Lager ist noch kein Terminal gekoppelt.' },
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
                <button type="button" class="status-indicator" on:click={() => checkStatus(true)} title="{title} Klicken zum erneuten Prüfen." aria-label="{info.label}: {info.hint} Erneut prüfen">
                    <span class="dot {status.state}"></span>
                    <span class="status-text">{info.label}</span>
                </button>
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

    {#if status.state === 'offline'}
        <div class="offline-banner" role="status">
            Das Terminal ist nicht erreichbar{lastSeen ? ` (zuletzt gemeldet ${lastSeen})` : ''}. LEDs und Waage reagieren erst wieder, wenn es verbunden ist.
        </div>
    {/if}

    <main class="terminal-content" bind:this={contentEl}>
        <slot />
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
    }
</style>