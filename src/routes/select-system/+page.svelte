<script>
    import { enhance } from '$app/forms';
    export let data;
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
            <div class="error-message">
                Dir ist noch kein Lager zugewiesen. Bitte kontaktiere deinen Administrator.
            </div>
        {:else}
            <div class="system-grid">
                {#each data.systems as system}
                    <form method="POST" action="?/select" use:enhance>
                        <input type="hidden" name="systemId" value={system.id} />
                        <button type="submit" class="system-btn">
                            <span class="system-name">{system.name}</span>
                            <span class="system-role">Rolle: {system.role}</span>
                        </button>
                    </form>
                {/each}
            </div>
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