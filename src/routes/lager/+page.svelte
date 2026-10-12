<script>
    import { enhance } from '$app/forms';
    export let data;
    export let form;

    $: isFull = !data.canCreate;
</script>

<svelte:head>
    <title>Lager verwalten | Sortify</title>
</svelte:head>

<div class="lager-page space-grotesk">
    <div class="page-header">
        <h1>Meine Lager</h1>
        <span class="page-subtitle">Alle Lager, auf die du Zugriff hast, und deine Rolle darin.</span>
    </div>

    <div class="lager-grid">
        <!-- Liste aller Lager -->
        <section class="card-box">
            <h2>Verfügbare Lager</h2>

            {#if data.systems.length === 0}
                <div class="empty-state">Du bist noch keinem Lager zugeordnet.</div>
            {:else}
                <ul class="system-list">
                    {#each data.systems as system (system.id)}
                        <li class="system-row" class:is-active={system.id === data.activeSystemId}>
                            <div class="system-info">
                                <span class="system-name">{system.name}</span>
                                <div class="badges">
                                    <span class="badge-role">{system.roleName}</span>
                                    {#if system.isOwner}<span class="badge-owner">Ersteller</span>{/if}
                                </div>
                            </div>

                            {#if system.id === data.activeSystemId}
                                <span class="badge-active"><i class="bi bi-check-circle-fill"></i> Aktiv</span>
                            {:else}
                                <!-- Normaler POST, damit alle Daten des neuen Lagers frisch geladen werden -->
                                <form method="POST" action="/select-system?/select">
                                    <input type="hidden" name="systemId" value={system.id} />
                                    <button type="submit" class="btn-switch">Wechseln</button>
                                </form>
                            {/if}
                        </li>
                    {/each}
                </ul>
            {/if}
        </section>

        <!-- Neues Lager anlegen -->
        <section class="card-box">
            <div class="create-header">
                <h2>Neues Lager anlegen</h2>
                <span class="quota" class:quota-full={isFull}>
                    {data.ownedCount}/{data.maxOwnSystems} eigene Lager
                </span>
            </div>

            <p class="hint">
                Du wirst automatisch Administrator des neuen Lagers.
                {#if isFull}
                    Du hast das Maximum an eigenen Lagern erreicht.
                {:else}
                    Du kannst noch {data.maxOwnSystems - data.ownedCount} weitere{data.maxOwnSystems - data.ownedCount === 1 ? 's' : ''} Lager anlegen.
                {/if}
            </p>

            <form method="POST" action="?/createSystem" use:enhance class="create-form">
                <label for="systemName">Name des Lagers</label>
                <input id="systemName" name="name" type="text" minlength="2" maxlength="60" required
                       placeholder="z.B. Werkstatt Zürich" value={form?.name ?? ''} disabled={isFull} />

                {#if form?.createError}
                    <div class="error-message">{form.createError}</div>
                {/if}

                <button type="submit" class="btn-create" disabled={isFull}>
                    <i class="bi bi-plus-lg"></i> Lager anlegen
                </button>
            </form>
        </section>
    </div>
</div>

<style>
    .lager-page { max-width: 1100px; margin: 0 auto; padding: 2.5rem 1rem; }

    .page-header { margin-bottom: 2rem; }
    .page-header h1 { margin: 0 0 0.4rem 0; font-size: 2rem; }
    .page-subtitle { color: #94a3b8; font-weight: 400; }

    .lager-grid { display: grid; grid-template-columns: 3fr 2fr; gap: 1.5rem; align-items: start; }
    @media (max-width: 860px) { .lager-grid { grid-template-columns: 1fr; } }

    .card-box { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.75rem; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
    .card-box h2 { font-size: 1.2rem; color: #334155; margin: 0 0 1.25rem 0; }

    .empty-state { color: #64748b; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 1.25rem; text-align: center; font-weight: 400; }

    .system-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
    .system-row {
        display: flex; justify-content: space-between; align-items: center; gap: 1rem;
        padding: 1rem 1.25rem; border: 2px solid #e2e8f0; border-radius: 10px; background: #f8fafc;
    }
    .system-row.is-active { border-color: #22c55e; background: #f0fdf4; }

    .system-info { display: flex; flex-direction: column; gap: 0.4rem; min-width: 0; }
    .system-name { font-size: 1.1rem; color: #334155; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .badges { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .badge-role, .badge-owner { font-size: 0.75rem; padding: 0.15rem 0.6rem; border-radius: 12px; font-weight: 600; }
    .badge-role { background: #e2e8f0; color: #475569; }
    .badge-owner { background: #dbeafe; color: #1d4ed8; }

    .badge-active { color: #16a34a; font-size: 0.9rem; white-space: nowrap; }

    .btn-switch {
        background: #ffffff; border: 2px solid #22c55e; color: #16a34a; border-radius: 8px;
        padding: 0.4rem 1rem; font-weight: 700; cursor: pointer; transition: all 0.2s; font-family: inherit;
    }
    .btn-switch:hover { background: #22c55e; color: #0B192C; }

    .create-header { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
    .create-header h2 { margin: 0; }
    .quota { font-size: 0.9rem; color: #16a34a; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 0.2rem 0.7rem; border-radius: 12px; }
    .quota.quota-full { color: #b91c1c; background: #fef2f2; border-color: #fecaca; }

    .hint { color: #64748b; font-size: 0.9rem; font-weight: 400; line-height: 1.5; margin: 0 0 1.25rem 0; }

    .create-form { display: flex; flex-direction: column; gap: 0.6rem; }
    .create-form label { color: #334155; font-size: 0.9rem; }
    .create-form input { padding: 0.75rem 1rem; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 1rem; font-family: inherit; }
    .create-form input:focus { outline: none; border-color: #22c55e; }
    .create-form input:disabled { background: #f1f5f9; cursor: not-allowed; }

    .error-message { background: #fef2f2; color: #b91c1c; padding: 0.75rem 1rem; border-radius: 6px; border: 1px solid #fecaca; font-weight: 400; }

    .btn-create {
        background: #22c55e; color: #0B192C; border: none; border-radius: 8px; padding: 0.8rem;
        font-weight: 700; font-size: 1rem; cursor: pointer; transition: background 0.2s; font-family: inherit;
    }
    .btn-create:hover:not(:disabled) { background: #16a34a; }
    .btn-create:disabled { background: #cbd5e1; color: #64748b; cursor: not-allowed; }
</style>
