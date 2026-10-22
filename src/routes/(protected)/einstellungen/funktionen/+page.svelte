<script>
    import { enhance } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    export let data;
    export let form;

    let saving = '';
    $: projectsOn = data.features?.projects === true;
</script>

<svelte:head><title>Funktionen | Sortify</title></svelte:head>

<div class="page-container space-grotesk">
    <div class="header">
        <h1>Funktionen</h1>
        <p class="subtitle">Zusätzliche Funktionen für dieses Lager ein- oder ausschalten. Ausgeschaltete Funktionen behalten ihre Daten.</p>
    </div>

    {#if form?.error}<div class="alert error">{form.error}</div>{/if}

    <div class="feature-card" class:on={projectsOn}>
        <div class="feature-head">
            <div>
                <h2>Projekte &amp; Kosten</h2>
                <p class="state">{projectsOn ? 'Eingeschaltet' : 'Ausgeschaltet'}</p>
            </div>
            <form method="POST" action="?/toggle" use:enhance={() => {
                saving = 'projects';
                return async ({ update }) => { await update({ reset: false }); await invalidateAll(); saving = ''; };
            }}>
                <input type="hidden" name="feature" value="projects" />
                <input type="hidden" name="enabled" value={String(!projectsOn)} />
                <button type="submit" class="switch" class:checked={projectsOn} role="switch" aria-checked={projectsOn}
                    aria-label="Projekte & Kosten ein- oder ausschalten" disabled={saving === 'projects'}>
                    <span class="knob"></span>
                </button>
            </form>
        </div>
        <ul class="feature-points">
            <li>Projekte mit Name, Beschreibung, optionalem Budget und Unterprojekten (z.B. „Autoentwicklung“ › „Räder“).</li>
            <li>Bei jeder Entnahme – Rückgabe eines Fachs am Terminal oder Bestandsänderung im Inventar – muss ein Projekt gewählt werden.</li>
            <li>Im Menü erscheint „Projekte“ mit den Kosten je Projekt und Unterprojekt, einer Materialliste und CSV-Export.</li>
        </ul>
        {#if projectsOn}
            <a class="link" href="/projekte">Zu den Projekten →</a>
        {/if}
    </div>
</div>

<style>
    .page-container { max-width: 900px; margin: 0 auto; padding: 2rem 1rem; color: #334155; }
    .header { margin-bottom: 1.5rem; }
    h1 { margin: 0; color: #22c55e; }
    .subtitle { margin: 0.4rem 0 0 0; color: #94a3b8; max-width: 640px; }
    .feature-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 1.4rem 1.5rem; display: flex; flex-direction: column; gap: 0.9rem; }
    .feature-card.on { border-color: #86efac; }
    .feature-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
    h2 { margin: 0; font-size: 1.25rem; color: #1e293b; }
    .state { margin: 0.2rem 0 0 0; font-size: 0.85rem; font-weight: 600; color: #94a3b8; }
    .on .state { color: #16a34a; }
    .feature-points { margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.35rem; color: #475569; font-size: 0.95rem; }
    .link { color: #2563eb; font-weight: 600; text-decoration: none; align-self: flex-start; }
    .switch { width: 52px; height: 30px; border-radius: 999px; border: none; background: #cbd5e1; position: relative; cursor: pointer; flex: none; transition: background 0.15s; }
    .switch.checked { background: #22c55e; }
    .switch:disabled { opacity: 0.6; cursor: wait; }
    .switch:focus-visible { outline: 3px solid #93c5fd; outline-offset: 2px; }
    .knob { position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.25); transition: transform 0.15s; }
    .switch.checked .knob { transform: translateX(22px); }
    .alert.error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; padding: 0.8rem 1rem; border-radius: 8px; margin-bottom: 1rem; }
</style>
