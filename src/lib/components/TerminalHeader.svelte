<script>
    // Einheitliche Kopfzeile für alle Terminal-Seiten: Titel, optionaler Untertitel und Zurück-Button.
    // Zusätzliche Aktionen (z.B. "Zurücksetzen") können über den Slot ergänzt werden.
    export let title;
    export let subtitle = '';
    export let backHref = '';
    export let backLabel = 'Zurück';
</script>

<header class="terminal-page-header">
    <div class="titles">
        <h1>{title}</h1>
        {#if subtitle}<p>{subtitle}</p>{/if}
    </div>

    <div class="actions">
        <slot />
        {#if backHref}
            <a href={backHref} class="terminal-back-btn">
                <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" aria-hidden="true">
                    <line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                {backLabel}
            </a>
        {/if}
    </div>
</header>

<style>
    .terminal-page-header {
        display: flex; justify-content: space-between; align-items: center; gap: 1rem;
        margin-bottom: 2rem; padding-bottom: 1.25rem; border-bottom: 1px solid #334155;
        font-family: "Space Grotesk", system-ui, sans-serif;
    }
    .titles { min-width: 0; text-align: left; }
    h1 { margin: 0; font-size: 2.2rem; font-weight: 700; color: #22c55e; line-height: 1.2; overflow-wrap: break-word; hyphens: auto; }
    p { margin: 0.4rem 0 0 0; color: #94a3b8; font-size: 1.05rem; font-weight: 600; }
    .actions { display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0; }

    .terminal-back-btn, .actions :global(.terminal-header-btn) {
        display: inline-flex; align-items: center; gap: 0.5rem; white-space: nowrap;
        background: #1e293b; color: #f8fafc; border: 1px solid #475569; border-radius: 10px;
        padding: 0.8rem 1.25rem; font-size: 1rem; font-weight: 600; text-decoration: none; cursor: pointer;
        font-family: inherit; transition: background 0.2s, border-color 0.2s;
    }
    .terminal-back-btn:hover, .actions :global(.terminal-header-btn:hover) { background: #334155; border-color: #64748b; color: #fff; }

    @media (max-width: 640px) {
        /* Buttons dürfen unter den Titel rutschen, statt ihn zusammenzudrücken */
        .terminal-page-header { margin-bottom: 1.25rem; padding-bottom: 1rem; gap: 0.75rem; flex-wrap: wrap; }
        .titles { flex: 1 1 12rem; }
        .actions { margin-left: auto; }
        h1 { font-size: 1.5rem; }
        p { font-size: 0.9rem; }
        .terminal-back-btn, .actions :global(.terminal-header-btn) { padding: 0.6rem 0.9rem; font-size: 0.95rem; }
    }
</style>
