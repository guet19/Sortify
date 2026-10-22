<script>
    import { enhance } from '$app/forms';
    import { toCsv } from '$lib/csv.js';
    import { budgetState, formatChf } from '$lib/projects.js';
    export let data;
    export let form;

    $: project = data.project;
    $: summary = data.summary;
    $: isMain = !project.parentId;
    $: isActive = project.status === 'active';
    $: budget = budgetState(summary.total, project.budget);

    let editing = false;
    let showSubForm = false;
    let confirmDelete = false;
    let movingId = null;
    let busy = '';

    const sourceLabels = {
        'web': 'Inventar',
        'terminal-rueckgabe': 'Terminal-Rückgabe',
        'terminal-fach-leer': 'Terminal (Fach geleert)'
    };
    const date = (iso) => new Date(iso).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' });
    const qty = (n) => Number(n).toLocaleString('de-CH', { maximumFractionDigits: 3 });
    // Bei Hauptprojekten: auf welches Unterprojekt wurde gebucht?
    const subName = (b) => (b.projectId === project.id ? 'Hauptprojekt' : summary.children.find((c) => c.id === b.projectId)?.name || b.projectName);

    // Nach jeder Aktion Formulare schliessen und Daten neu laden
    const submit = (name, after) => () => {
        busy = name;
        return async ({ result, update }) => {
            await update({ reset: result.type === 'success' });
            busy = '';
            if (result.type === 'success') after?.();
        };
    };

    function download(blob, filename) {
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
        document.body.appendChild(a); a.click(); a.remove();
    }

    function exportCsv() {
        const rows = [['Datum', 'Projekt', 'Artikel', 'Menge', 'Stückpreis (CHF)', 'Betrag (CHF)', 'Person', 'Quelle']];
        for (const b of data.allBookings || data.bookings) {
            rows.push([date(b.createdAt), b.projectName, b.articleTitle, b.quantity, b.unitPrice !== null ? b.unitPrice.toFixed(2) : '', b.total.toFixed(2), b.userName, sourceLabels[b.source] || b.source]);
        }
        rows.push([], ['Gesamt', '', '', '', '', summary.total.toFixed(2)]);
        const name = project.name.replace(/[^\w-]+/g, '_').slice(0, 40);
        download(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }), `Projekt_${name}_${new Date().toISOString().slice(0, 10)}.csv`);
    }
</script>

<svelte:head><title>{project.name} | Projekte | Sortify</title></svelte:head>

<div class="page-container space-grotesk">
    <nav class="breadcrumb">
        <a href="/projekte">Projekte</a>
        {#if data.parent}<span>/</span><a href="/projekte/{data.parent.id}">{data.parent.name}</a>{/if}
        <span>/</span><span class="current">{project.name}</span>
    </nav>

    <div class="header">
        <div class="title-block">
            <div class="title-row">
                <h1>{project.name}</h1>
                <span class="status" class:closed={!isActive}>{isActive ? 'Aktiv' : 'Abgeschlossen'}</span>
            </div>
            {#if project.description}<p class="description">{project.description}</p>{/if}
        </div>
        <div class="header-actions">
            {#if summary.bookingCount > 0}<button type="button" class="btn-secondary" on:click={exportCsv}>CSV-Export</button>{/if}
            <button type="button" class="btn-secondary" on:click={() => (editing = !editing)}>{editing ? 'Abbrechen' : 'Bearbeiten'}</button>
            <form method="POST" action="?/status" use:enhance={submit('status')}>
                <input type="hidden" name="status" value={isActive ? 'closed' : 'active'} />
                <button type="submit" class="btn-secondary" disabled={busy === 'status'}>{isActive ? 'Abschliessen' : 'Wieder öffnen'}</button>
            </form>
        </div>
    </div>

    {#if form?.error && ['status', 'delete'].includes(form.action)}<div class="alert error">{form.error}</div>{/if}

    {#if editing}
        <div class="card edit-card">
            <form method="POST" action="?/update" class="edit-form" use:enhance={submit('update', () => (editing = false))}>
                {#if form?.action === 'update' && form.error}<div class="alert error">{form.error}</div>{/if}
                <label for="edit-name">Projektname</label>
                <input id="edit-name" name="name" required maxlength="80" value={project.name} />
                <label for="edit-description">Beschreibung</label>
                <textarea id="edit-description" name="description" rows="3" maxlength="2000">{project.description}</textarea>
                <label for="edit-budget">Budget in CHF <span class="optional">(leer = kein Budget)</span></label>
                <input id="edit-budget" name="budget" inputmode="decimal" value={project.budget ?? ''} />
                <button type="submit" class="btn-primary save" disabled={busy === 'update'}>Speichern</button>
            </form>
            <div class="delete-area">
                {#if summary.bookingCount > 0}
                    <span class="hint">Projekte mit Buchungen können nicht gelöscht, nur abgeschlossen werden.</span>
                {:else if confirmDelete}
                    <form method="POST" action="?/delete" use:enhance={submit('delete')}>
                        <button type="submit" class="btn-danger">{isMain && summary.children.length ? 'Projekt und Unterprojekte löschen' : 'Endgültig löschen'}</button>
                    </form>
                    <button type="button" class="btn-link" on:click={() => (confirmDelete = false)}>Nicht löschen</button>
                {:else}
                    <button type="button" class="btn-link danger" on:click={() => (confirmDelete = true)}>Projekt löschen…</button>
                {/if}
            </div>
        </div>
    {/if}

    <div class="tiles">
        <div class="tile"><span class="tile-label">Kosten gesamt</span><span class="tile-value">CHF {formatChf(summary.total)}</span></div>
        <div class="tile"><span class="tile-label">Entnahmen</span><span class="tile-value">{summary.bookingCount}</span></div>
        {#if budget}
            <div class="tile budget" class:over={budget.over}>
                <span class="tile-label">Budget CHF {formatChf(project.budget)}</span>
                <span class="tile-value">{budget.percent}%</span>
                <div class="bar"><span style="width: {budget.bar}%"></span></div>
                <small>{budget.over ? `CHF ${formatChf(-budget.remaining)} überschritten` : `CHF ${formatChf(budget.remaining)} übrig`}</small>
            </div>
        {/if}
    </div>
    {#if summary.withoutPrice > 0}
        <p class="note">{summary.withoutPrice} Buchung(en) ohne Stückpreis – diese Artikel zählen mit CHF 0. Preise lassen sich beim Artikel unter „Bearbeiten“ ergänzen.</p>
    {/if}

    {#if isMain}
        <section class="card">
            <div class="section-head">
                <h2>Unterprojekte</h2>
                {#if isActive}
                    <button type="button" class="btn-secondary small" on:click={() => (showSubForm = !showSubForm)}>{showSubForm ? 'Abbrechen' : '+ Unterprojekt'}</button>
                {/if}
            </div>
            {#if showSubForm}
                <form method="POST" action="?/createSub" class="sub-form" use:enhance={submit('createSub', () => (showSubForm = false))}>
                    {#if form?.action === 'createSub' && form.error}<div class="alert error">{form.error}</div>{/if}
                    <input name="name" required maxlength="80" placeholder="Name, z.B. Räder" aria-label="Name des Unterprojekts" value={form?.values?.name || ''} />
                    <input name="description" maxlength="2000" placeholder="Beschreibung (optional)" aria-label="Beschreibung des Unterprojekts" value={form?.values?.description || ''} />
                    <input name="budget" inputmode="decimal" placeholder="Budget CHF (optional)" aria-label="Budget des Unterprojekts" />
                    <button type="submit" class="btn-primary" disabled={busy === 'createSub'}>Anlegen</button>
                </form>
            {/if}
            {#if summary.children.length === 0}
                <p class="muted">Noch keine Unterprojekte. Damit lassen sich die Kosten weiter aufteilen, z.B. „Räder“ und „Motor“.</p>
            {:else}
                <div class="table-wrap">
                    <table>
                        <thead><tr><th>Unterprojekt</th><th class="num">Entnahmen</th><th class="num">Kosten (CHF)</th><th class="num">Anteil</th></tr></thead>
                        <tbody>
                            {#each summary.children as child (child.id)}
                                {@const childBudget = budgetState(child.total, child.budget)}
                                <tr>
                                    <td><a href="/projekte/{child.id}" class="link">{child.name}</a>{#if child.status !== 'active'} <span class="tag">abgeschlossen</span>{/if}{#if childBudget?.over} <span class="tag warn">über Budget</span>{/if}</td>
                                    <td class="num">{child.count}</td>
                                    <td class="num">{formatChf(child.total)}</td>
                                    <td class="num">{summary.total ? Math.round((child.total / summary.total) * 100) : 0}%</td>
                                </tr>
                            {/each}
                            <tr class="muted-row">
                                <td>Direkt auf „{project.name}“</td>
                                <td class="num">{summary.direct.count}</td>
                                <td class="num">{formatChf(summary.direct.total)}</td>
                                <td class="num">{summary.total ? Math.round((summary.direct.total / summary.total) * 100) : 0}%</td>
                            </tr>
                        </tbody>
                        <tfoot><tr><td>Gesamt</td><td class="num">{summary.bookingCount}</td><td class="num">{formatChf(summary.total)}</td><td></td></tr></tfoot>
                    </table>
                </div>
            {/if}
        </section>
    {/if}

    <section class="card">
        <h2>Materialliste</h2>
        {#if summary.materials.length === 0}
            <p class="muted">Noch kein Material verbraucht. Entnahmen am Terminal oder im Inventar erscheinen hier, sobald dabei dieses Projekt gewählt wird.</p>
        {:else}
            <div class="table-wrap">
                <table>
                    <thead><tr><th>Artikel</th><th class="num">Menge</th><th class="num">Kosten (CHF)</th></tr></thead>
                    <tbody>
                        {#each summary.materials as m (m.articleId || m.title)}
                            <tr>
                                <td>{#if m.articleId}<a href="/{m.articleId}" class="link">{m.title}</a>{:else}{m.title}{/if}</td>
                                <td class="num">{qty(m.quantity)}</td>
                                <td class="num">{formatChf(m.total)}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {/if}
    </section>

    {#if data.bookings.length > 0}
        <section class="card">
            <h2>Buchungen</h2>
            {#if form?.action === 'move' && form.error}<div class="alert error">{form.error}</div>{/if}
            <div class="table-wrap">
                <table class="bookings">
                    <thead>
                        <tr>
                            <th>Datum</th><th>Artikel</th>{#if isMain}<th>Projekt</th>{/if}
                            <th class="num">Menge</th><th class="num">Stk.-Preis</th><th class="num">Betrag</th><th>Person</th><th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each data.bookings as b (b.id)}
                            <tr class:return={b.quantity < 0}>
                                <td class="nowrap">{date(b.createdAt)}</td>
                                <td>{b.articleTitle}</td>
                                {#if isMain}<td>{subName(b)}</td>{/if}
                                <td class="num">{b.quantity < 0 ? `${qty(-b.quantity)} zurück` : qty(b.quantity)}</td>
                                <td class="num">{b.unitPrice !== null ? formatChf(b.unitPrice) : '–'}</td>
                                <td class="num">{formatChf(b.total)}</td>
                                <td class="person">{b.userName || '–'}<small>{sourceLabels[b.source] || b.source}</small></td>
                                <td class="nowrap">
                                    {#if movingId === b.id}
                                        <form method="POST" action="?/move" class="move-form" use:enhance={submit('move', () => (movingId = null))}>
                                            <input type="hidden" name="bookingId" value={b.id} />
                                            <select name="targetProjectId" required aria-label="Zielprojekt">
                                                <option value="">Zielprojekt…</option>
                                                {#each data.moveTargets.filter((t) => t.id !== b.projectId) as t (t.id)}
                                                    <option value={t.id}>{t.label}</option>
                                                {/each}
                                            </select>
                                            <button type="submit" class="btn-primary small" disabled={busy === 'move'}>OK</button>
                                            <button type="button" class="btn-link" on:click={() => (movingId = null)}>✕</button>
                                        </form>
                                    {:else}
                                        <button type="button" class="btn-link" on:click={() => (movingId = b.id)}>Umbuchen</button>
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
            {#if data.allBookings}<p class="muted">Angezeigt werden die letzten {data.bookings.length} von {data.allBookings.length} Buchungen. Der CSV-Export enthält alle.</p>{/if}
        </section>
    {/if}
</div>

<style>
    .page-container { max-width: 1200px; margin: 0 auto; padding: 2rem 1rem; color: #334155; display: flex; flex-direction: column; gap: 1.25rem; }
    .breadcrumb { display: flex; gap: 0.5rem; flex-wrap: wrap; font-size: 0.9rem; color: #64748b; }
    .breadcrumb a { color: #94a3b8; text-decoration: none; }
    .breadcrumb a:hover { color: #fff; }
    .breadcrumb .current { color: #cbd5e1; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    .title-block { min-width: 0; flex: 1 1 320px; }
    .title-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
    h1 { margin: 0; color: #22c55e; overflow-wrap: anywhere; }
    .description { margin: 0.5rem 0 0 0; color: #cbd5e1; max-width: 70ch; white-space: pre-line; }
    .status { background: #dcfce7; color: #166534; border-radius: 999px; padding: 0.15rem 0.7rem; font-size: 0.8rem; font-weight: 700; }
    .status.closed { background: #e2e8f0; color: #475569; }
    .header-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .header-actions form { margin: 0; }

    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 0.75rem; min-width: 0; }
    .card h2 { margin: 0; font-size: 1.15rem; color: #1e293b; }
    .section-head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
    .muted { margin: 0; color: #64748b; font-size: 0.92rem; }
    .note { margin: -0.5rem 0 0 0; color: #fbbf24; font-size: 0.88rem; }

    .edit-card { max-width: 680px; }
    .edit-form { display: flex; flex-direction: column; gap: 0.45rem; }
    .edit-form .save { align-self: flex-start; margin-top: 0.5rem; }
    .delete-area { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; border-top: 1px solid #f1f5f9; padding-top: 0.75rem; }
    .delete-area form { margin: 0; }
    label { font-size: 0.85rem; font-weight: 600; color: #475569; margin-top: 0.3rem; }
    .optional { font-weight: 400; color: #94a3b8; }
    input, textarea, select { border: 1px solid #cbd5e1; border-radius: 6px; padding: 0.55rem 0.65rem; font-family: inherit; font-size: 0.95rem; color: #1e293b; background: #fff; min-width: 0; }
    input:focus, textarea:focus, select:focus { outline: 2px solid #93c5fd; border-color: #3b82f6; }
    .hint { color: #94a3b8; font-size: 0.82rem; }
    .sub-form { display: grid; grid-template-columns: 1.2fr 2fr 1fr auto; gap: 0.5rem; }
    .sub-form .alert { grid-column: 1 / -1; }
    @media (max-width: 760px) { .sub-form { grid-template-columns: 1fr; } }

    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; }
    .tile { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.9rem 1rem; display: flex; flex-direction: column; gap: 0.2rem; }
    .tile-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; font-weight: 700; }
    .tile-value { font-size: 1.5rem; font-weight: 700; color: #1e293b; font-variant-numeric: tabular-nums; }
    .tile small { color: #64748b; font-size: 0.8rem; }
    .bar { height: 6px; background: #e2e8f0; border-radius: 999px; overflow: hidden; margin-top: 0.2rem; }
    .bar span { display: block; height: 100%; background: #22c55e; }
    .budget.over { border-color: #fecaca; background: #fef2f2; }
    .budget.over .tile-value, .budget.over small { color: #dc2626; }
    .budget.over .bar span { background: #dc2626; }

    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
    th { text-align: left; color: #64748b; font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.03em; padding: 0.5rem; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
    td { padding: 0.55rem 0.5rem; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    tfoot td { font-weight: 700; color: #1e293b; border-bottom: none; border-top: 2px solid #e2e8f0; }
    .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .nowrap { white-space: nowrap; }
    .muted-row td { color: #64748b; }
    tr.return td { color: #15803d; }
    .person small { display: block; color: #94a3b8; font-size: 0.75rem; }
    .link { color: #1e293b; font-weight: 600; text-decoration: none; }
    .link:hover { color: #2563eb; }
    .tag { background: #f1f5f9; color: #64748b; border-radius: 999px; padding: 0.05rem 0.5rem; font-size: 0.72rem; font-weight: 600; }
    .tag.warn { background: #fee2e2; color: #b91c1c; }
    .move-form { display: flex; gap: 0.35rem; align-items: center; margin: 0; }
    .move-form select { max-width: 220px; padding: 0.3rem 0.4rem; font-size: 0.85rem; }

    .btn-primary, .btn-secondary, .btn-danger { border: none; border-radius: 6px; padding: 0.55rem 1rem; font-weight: 600; cursor: pointer; font-family: inherit; font-size: 0.92rem; }
    .btn-primary { background: #3b82f6; color: #fff; }
    .btn-primary:hover { background: #2563eb; }
    .btn-secondary { background: #fff; color: #334155; border: 1px solid #cbd5e1; }
    .btn-secondary:hover { background: #f1f5f9; }
    .btn-danger { background: #dc2626; color: #fff; }
    .small { padding: 0.35rem 0.7rem; font-size: 0.85rem; }
    button:disabled { opacity: 0.6; cursor: wait; }
    .btn-link { background: none; border: none; color: #2563eb; cursor: pointer; font-family: inherit; font-size: 0.85rem; font-weight: 600; padding: 0.2rem; }
    .btn-link.danger { color: #dc2626; }
    .alert.error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; padding: 0.7rem 0.9rem; border-radius: 6px; font-size: 0.9rem; }
</style>
