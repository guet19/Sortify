<script>
    // Zeigt, welches KI-Modell verwendet wurde/wird – inkl. Qualitätsstufe und Grund für einen Modellwechsel
    export let model = null;
    export let prefix = 'KI-Modell';

    const reasons = {
        quota_day: 'Tageskontingent erschöpft',
        quota_minute: 'Minutenlimit erreicht',
        unavailable: 'überlastet',
        timeout: 'zu langsam',
        not_found: 'nicht verfügbar'
    };
</script>

{#if model}
    <div class="ai-model-badge tier-{model.tier}">
        <span class="ai-model-main">
            🤖 {prefix}: <strong>{model.label}</strong>
            <span class="ai-model-tier">{model.tierLabel}</span>
        </span>
        {#if model.fallback && model.skipped?.length}
            <span class="ai-model-note">
                Automatisch gewechselt –
                {model.skipped.map((s) => `${s.label} (${reasons[s.reason] || 'nicht verfügbar'})`).join(', ')}
            </span>
        {/if}
    </div>
{/if}

<style>
    .ai-model-badge {
        display: inline-flex; flex-direction: column; gap: 0.2rem; text-align: left;
        padding: 0.45rem 0.75rem; border-radius: 8px; font-size: 0.82rem; line-height: 1.35;
        background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;
    }
    .ai-model-badge.tier-good { background: #fffbeb; border-color: #fde68a; color: #92400e; }
    .ai-model-main { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
    .ai-model-tier {
        font-size: 0.72rem; font-weight: 700; padding: 0.05rem 0.5rem; border-radius: 999px;
        background: #dcfce7; color: #15803d;
    }
    .tier-good .ai-model-tier { background: #fef3c7; color: #b45309; }
    .ai-model-note { font-size: 0.75rem; opacity: 0.85; }
</style>
