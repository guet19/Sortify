<script>
    // Warnt beim Eintippen einer GTIN, wenn es im Lager schon einen Artikel damit gibt.
    // excludeId: beim Bearbeiten den eigenen Artikel nicht melden
    import { onDestroy } from 'svelte';
    export let gtin = '';
    export let excludeId = '';

    let matches = [];
    let timer;
    let checked = '';

    $: schedule(gtin);

    function schedule(value) {
        clearTimeout(timer);
        const v = String(value || '').trim();
        if (v.length < 4) { matches = []; checked = ''; return; }
        if (v === checked) return;
        timer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/article-gtin?gtin=${encodeURIComponent(v)}${excludeId ? `&exclude=${excludeId}` : ''}`);
                if (!res.ok) return;
                const data = await res.json();
                // Nur übernehmen, wenn das Feld inzwischen nicht weiter geändert wurde
                if (String(gtin || '').trim() === v) { matches = data.matches || []; checked = v; }
            } catch { /* Prüfung ist nur ein Hinweis */ }
        }, 400);
    }
    onDestroy(() => clearTimeout(timer));
</script>

{#if matches.length}
    <div class="gtin-warning" role="status">
        ⚠️ Diese GTIN gibt es schon:
        {#each matches as m (m.id)}
            <a href="/{m.id}" target="_blank" rel="noopener">{m.title}</a>
        {/each}
    </div>
{/if}

<style>
    .gtin-warning { margin-top: 0.35rem; padding: 0.45rem 0.6rem; border-radius: 6px; background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; font-size: 0.85rem; font-weight: 600; display: flex; flex-wrap: wrap; gap: 0.25rem 0.6rem; }
    .gtin-warning a { color: #b45309; text-decoration: underline; font-weight: 600; }
</style>
