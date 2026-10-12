<script>
    import { enhance } from '$app/forms';
    export let data;
    export let form;

    // Bei Nutzern mit Lagern ist das Formular eingeklappt
    let showCreate = false;
    $: if (form?.createError) showCreate = true;
</script>

<svelte:head>
    <title>Lager auswählen | Sortify</title>
</svelte:head>

<div class="login-container space-grotesk">
    <div class="login-card">
        <div class="login-header">
            <h1>Lager auswählen</h1>
            <p>Mit welchem Lager möchtest du dich verbinden?</p>
        </div>

        {#if data.systems.length === 0}
            <p class="info-text">
                Du bist noch keinem Lager zugeordnet.
                {#if data.canCreate}Erstelle dein eigenes Lager. Du wirst automatisch dessen Administrator.{/if}
                Wenn du einem bestehenden Lager beitreten möchtest, bitte dessen Administrator, dich hinzuzufügen.
            </p>
        {:else}
            <div class="system-grid">
                {#each data.systems as system}
                    <form method="POST" action="?/select" use:enhance>
                        <input type="hidden" name="systemId" value={system.id} />
                        <button type="submit" class="system-btn">
                            <span class="system-name">{system.name}</span>
                            <span class="system-role">Rolle: {system.roleName}</span>
                        </button>
                    </form>
                {/each}
            </div>
        {/if}

        {#if !data.canCreate}
            <p class="info-text limit-text">
                Du hast bereits {data.maxOwnSystems} eigene Lager erstellt – mehr sind nicht möglich.
            </p>
        {:else if data.systems.length === 0 || showCreate}
            <form method="POST" action="?/createSystem" use:enhance class="create-form">
                <label for="systemName">Name des neuen Lagers</label>
                <input id="systemName" name="name" type="text" minlength="2" maxlength="60" required
                       placeholder="z.B. Werkstatt Zürich" value={form?.name ?? ''} />
                {#if form?.createError}
                    <div class="error-message">{form.createError}</div>
                {/if}
                <button type="submit" class="create-btn">Lager erstellen</button>
            </form>
        {:else}
            <button type="button" class="link-btn" on:click={() => (showCreate = true)}>
                + Neues Lager erstellen
            </button>
        {/if}
    </div>
</div>

<style>
    /* Styling passend zu deinem Login-Design */
    .login-container { display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 1rem; }
    .login-card { background: #ffffff; padding: 2.5rem; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); width: 100%; max-width: 450px; border: 1px solid #e2e8f0; }
    
    .login-header { text-align: center; margin-bottom: 2rem; }
    .login-header h1 { margin: 0 0 0.5rem 0; color: #22c55e; font-size: 1.8rem; }
    .login-header p { margin: 0; color: #64748b; font-size: 0.95rem; }

    .error-message { background: #fef2f2; color: #b91c1c; padding: 1rem; border-radius: 6px; border: 1px solid #fecaca; text-align: center; }

    .system-grid { display: flex; flex-direction: column; gap: 1rem; }

    .info-text { color: #475569; font-size: 0.95rem; line-height: 1.5; margin: 0 0 1.5rem 0; text-align: center; }
    .limit-text { margin: 1.5rem 0 0 0; font-size: 0.85rem; color: #64748b; }

    .create-form { display: flex; flex-direction: column; gap: 0.6rem; margin-top: 1.5rem; }
    .create-form label { font-weight: 600; color: #334155; font-size: 0.9rem; }
    .create-form input {
        padding: 0.75rem 1rem;
        border: 2px solid #e2e8f0;
        border-radius: 8px;
        font-size: 1rem;
        font-family: inherit;
    }
    .create-form input:focus { outline: none; border-color: #22c55e; }

    .create-btn {
        background: #22c55e;
        color: #0B192C;
        border: none;
        border-radius: 8px;
        padding: 0.8rem;
        font-weight: 700;
        font-size: 1rem;
        cursor: pointer;
        transition: background 0.2s;
    }
    .create-btn:hover { background: #16a34a; }

    .link-btn {
        display: block;
        margin: 1.5rem auto 0;
        background: none;
        border: none;
        color: #16a34a;
        font-weight: 600;
        cursor: pointer;
        font-size: 0.95rem;
    }
    .link-btn:hover { text-decoration: underline; }
    
    .system-btn {
        width: 100%;
        background: #f8fafc;
        border: 2px solid #e2e8f0;
        border-radius: 8px;
        padding: 1.2rem;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        transition: all 0.2s;
    }

    .system-btn:hover {
        border-color: #22c55e;
        background: #f0fdf4;
        transform: translateY(-2px);
    }

    .system-name {
        font-size: 1.2rem;
        font-weight: 700;
        color: #334155;
    }

    .system-role {
        font-size: 0.85rem;
        background: #e2e8f0;
        color: #475569;
        padding: 0.2rem 0.6rem;
        border-radius: 12px;
        font-weight: 600;
    }
</style>