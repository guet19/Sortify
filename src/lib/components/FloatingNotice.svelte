<script>
    // Schwebende Info bei fehlenden Pflichtangaben. Formulare mit eigener Prüfung rufen reportMissingFields()
    // auf; für alle anderen (Attribut required) ersetzt sie hier die kleine Sprechblase des Browsers.
    import { onMount } from 'svelte';
    import { closeNotice, floatingNotice, reportMissingFields } from '$lib/requiredFields.js';

    let missing = [];

    // Der Browser meldet jedes ungültige Feld einzeln, von oben nach unten -> erst sammeln, dann einmal anzeigen.
    // Andere Fehler (z.B. ungültige E-Mail) und Kästchen behalten die Browser-Meldung, sie nennt den Grund.
    function onInvalid(event) {
        const field = event.target;
        if (!field.validity?.valueMissing || ['checkbox', 'radio', 'file'].includes(field.type)) return;
        event.preventDefault();
        if (missing.length === 0) {
            setTimeout(() => {
                reportMissingFields(missing);
                missing = [];
            });
        }
        missing.push(field);
    }

    onMount(() => {
        document.addEventListener('invalid', onInvalid, true);
        return () => document.removeEventListener('invalid', onInvalid, true);
    });
</script>

{#if $floatingNotice}
    {#key $floatingNotice.id}
        <div class="floating-notice" role="alert">
            <span aria-hidden="true">⚠️</span>
            <span class="notice-text">{$floatingNotice.text}</span>
            <button type="button" aria-label="Hinweis schliessen" on:click={closeNotice}>&times;</button>
        </div>
    {/key}
{/if}

<style>
    .floating-notice {
        position: fixed; top: 1rem; left: 50%; transform: translateX(-50%); z-index: 3000;
        display: flex; align-items: center; gap: 0.6rem; box-sizing: border-box;
        width: max-content; max-width: min(92vw, 560px); padding: 0.7rem 0.9rem;
        background: #1e293b; color: #f8fafc; border-left: 4px solid #f59e0b; border-radius: 8px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35); font-family: "Space Grotesk", system-ui, sans-serif; font-size: 0.95rem; font-weight: 600;
        animation: notice-in 0.2s ease-out;
    }
    .notice-text { min-width: 0; overflow-wrap: anywhere; line-height: 1.35; }
    button { flex: none; background: none; border: none; color: #94a3b8; font-size: 1.3rem; line-height: 1; padding: 0 0.15rem; cursor: pointer; }
    button:hover { color: #f8fafc; }
    @keyframes notice-in { from { opacity: 0; transform: translate(-50%, -10px); } to { opacity: 1; transform: translate(-50%, 0); } }
    @media (prefers-reduced-motion: reduce) { .floating-notice { animation: none; } }
</style>
