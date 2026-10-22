<script>
    import { enhance } from '$app/forms';
    import { page } from '$app/stores';
    import { canAccessPath } from '$lib/permissions.js';
    import { buildProjectTree, budgetState, formatChf } from '$lib/projects.js';
    export let data;
    export let form;

    let showForm = !!form?.error;
    let saving = false;

    $: tree = data.enabled ? buildProjectTree(data.projects) : [];
    $: active = tree.filter((p) => p.status === 'active');
    $: closed = tree.filter((p) => p.status !== 'active');
    $: totals = data.totals || {};
    $: canConfigure = canAccessPath('/einstellungen/funktionen', $page.data.allowedRoutes || []);
    const costOf = (id) => totals[id]?.total || 0;
    const date = (iso) => (iso ? new Date(iso).toLocaleDateString('de-CH') : '–');
</script>

<svelte:head><title>Projekte | Sortify</title></svelte:head>

<div class="page-container space-grotesk">
    <div class="header">
        <div>
            <h1>Projekte</h1>
            <p class="subtitle">Verbrauch aus dem Lager nach Projekten – mit Kosten je Projekt und Unterprojekt.</p>
        </div>
        {#if data.enabled}
            <button type="button" class="btn-primary" on:click={() => (showForm = !showForm)}>{showForm ? 'Abbrechen' : '+ Neues Projekt'}</button>
        {/if}
    </div>

    {#if !data.enabled}
        <div class="card empty">
            <h2>Die Funktion „Projekte“ ist ausgeschaltet</h2>
            <p>Sie lässt sich pro Lager unter Funktionen einschalten.</p>
            {#if canConfigure}<a class="btn-primary" href="/einstellungen/funktionen">Zu den Funktionen</a>{/if}
        </div>
    {:else}
        {#if showForm}
            <form method="POST" action="?/create" class="card new-form" use:enhance={() => {
                saving = true;
                return async ({ update }) => { await update(); saving = false; };
            }}>
                <h2>Neues Projekt</h2>
                {#if form?.error}<div class="alert error">{form.error}</div>{/if}
                <label for="new-name">Projektname</label>
                <input id="new-name" name="name" required maxlength="80" placeholder="z.B. Autoentwicklung" value={form?.values?.name || ''} />
                <label for="new-description">Beschreibung</label>
                <textarea id="new-description" name="description" rows="3" maxlength="2000" placeholder="Worum geht es?">{form?.values?.description || ''}</textarea>
                <label for="new-budget">Budget in CHF <span class="optional">(optional)</span></label>
                <input id="new-budget" name="budget" inputmode="decimal" placeholder="z.B. 500" />
                <button type="submit" class="btn-primary" disabled={saving}>{saving ? 'Wird angelegt…' : 'Projekt anlegen'}</button>
            </form>
        {/if}

        {#if active.length === 0 && closed.length === 0}
            <div class="card empty">
                <h2>Noch keine Projekte</h2>
                <p>Lege ein Projekt an. Danach fragt Sortify bei jeder Entnahme, für welches Projekt das Material ist – am Terminal und im Inventar.</p>
            </div>
        {/if}

        {#if active.length > 0}
            <div class="grid">
                {#each active as project (project.id)}
                    {@const budget = budgetState(costOf(project.id), project.budget)}
                    <a class="card project-card" href="/projekte/{project.id}">
                        <div class="project-top">
                            <h2>{project.name}</h2>
                            <span class="cost">CHF {formatChf(costOf(project.id))}</span>
                        </div>
                        {#if project.description}<p class="description">{project.description}</p>{/if}
                        {#if project.children.length}
                            <div class="chips">
                                {#each project.children as child (child.id)}
                                    <span class="chip" class:closed={child.status !== 'active'}>{child.name}</span>
                                {/each}
                            </div>
                        {/if}
                        {#if budget}
                            <div class="budget" class:over={budget.over}>
                                <div class="bar"><span style="width: {budget.bar}%"></span></div>
                                <small>{budget.percent}% von CHF {formatChf(project.budget)}</small>
                            </div>
                        {/if}
                        <small class="meta">{totals[project.id]?.count || 0} Buchungen · zuletzt {date(totals[project.id]?.lastAt)}</small>
                    </a>
                {/each}
            </div>
        {/if}

        {#if closed.length > 0}
            <details class="closed-list">
                <summary>Abgeschlossene Projekte ({closed.length})</summary>
                <ul>
                    {#each closed as project (project.id)}
                        <li><a href="/projekte/{project.id}">{project.name}</a><span>CHF {formatChf(costOf(project.id))} · abgeschlossen {date(project.closedAt)}</span></li>
                    {/each}
                </ul>
            </details>
        {/if}
    {/if}
</div>

<style>
    .page-container { max-width: 1200px; margin: 0 auto; padding: 2rem 1rem; color: #334155; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
    h1 { margin: 0; color: #22c55e; }
    .subtitle { margin: 0.4rem 0 0 0; color: #94a3b8; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .card h2 { margin: 0; font-size: 1.15rem; color: #1e293b; }
    .empty { text-align: center; padding: 2.5rem 1.25rem; display: flex; flex-direction: column; align-items: center; gap: 0.6rem; margin-bottom: 1.25rem; }
    .empty p { margin: 0; color: #64748b; max-width: 520px; }

    .new-form { display: flex; flex-direction: column; gap: 0.45rem; max-width: 640px; margin-bottom: 1.5rem; }
    .new-form h2 { margin-bottom: 0.4rem; }
    label { font-size: 0.85rem; font-weight: 600; color: #475569; margin-top: 0.35rem; }
    .optional { font-weight: 400; color: #94a3b8; }
    input, textarea { border: 1px solid #cbd5e1; border-radius: 6px; padding: 0.6rem 0.7rem; font-family: inherit; font-size: 0.95rem; color: #1e293b; background: #fff; }
    input:focus, textarea:focus { outline: 2px solid #93c5fd; border-color: #3b82f6; }
    .new-form .btn-primary { align-self: flex-start; margin-top: 0.6rem; }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
    .project-card { display: flex; flex-direction: column; gap: 0.6rem; text-decoration: none; color: inherit; transition: transform 0.15s, box-shadow 0.15s; min-width: 0; }
    .project-card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.08); }
    .project-top { display: flex; justify-content: space-between; align-items: baseline; gap: 0.25rem 0.75rem; flex-wrap: wrap; }
    .project-top h2 { overflow-wrap: break-word; min-width: 0; }
    .cost { font-weight: 700; color: #0284c7; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .description { margin: 0; color: #64748b; font-size: 0.92rem; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .chip { background: #eff6ff; color: #1d4ed8; border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.78rem; font-weight: 600; }
    .chip.closed { background: #f1f5f9; color: #94a3b8; text-decoration: line-through; }
    .budget { display: flex; flex-direction: column; gap: 0.25rem; }
    .bar { height: 6px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
    .bar span { display: block; height: 100%; background: #22c55e; }
    .budget.over .bar span { background: #dc2626; }
    .budget small { color: #64748b; font-size: 0.78rem; }
    .budget.over small { color: #dc2626; font-weight: 600; }
    .meta { color: #94a3b8; font-size: 0.78rem; margin-top: auto; }

    .closed-list { margin-top: 1.5rem; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.9rem 1.25rem; }
    .closed-list summary { cursor: pointer; font-weight: 600; color: #475569; }
    .closed-list ul { list-style: none; margin: 0.75rem 0 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.45rem; }
    .closed-list li { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
    .closed-list a { color: #1e293b; font-weight: 600; text-decoration: none; }
    .closed-list span { color: #94a3b8; font-size: 0.88rem; }

    .btn-primary { border: none; border-radius: 6px; padding: 0.6rem 1.1rem; font-weight: 600; cursor: pointer; font-family: inherit; background: #3b82f6; color: #fff; text-decoration: none; display: inline-flex; align-items: center; gap: 0.4rem; }
    .btn-primary:hover { background: #2563eb; }
    .btn-primary:disabled { background: #93c5fd; cursor: wait; }
    .alert.error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; padding: 0.7rem 0.9rem; border-radius: 6px; font-size: 0.9rem; }
</style>
