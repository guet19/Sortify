<script>
    import { enhance } from '$app/forms';
    export let form;
    
    let isSubmitting = false;
</script>

<svelte:head>
    <title>Neues Passwort setzen | Sortify</title>
</svelte:head>

<div class="reset-container space-grotesk">
    <div class="reset-card">
        <div class="reset-header">
            <h1>Neues Passwort</h1>
            <p>Bitte vergib ein neues, sicheres Passwort für deinen Account.</p>
        </div>

        {#if form?.error}
            <div class="error-message">{form.error}</div>
        {/if}

        <form method="POST" use:enhance={() => {
            isSubmitting = true;
            return async ({ update }) => {
                await update();
                isSubmitting = false;
            };
        }} class="reset-form">
            
            <div class="input-group">
                <label for="password">Neues Passwort</label>
                <input type="password" id="password" name="password" required minlength="8" placeholder="••••••••" />
            </div>

            <div class="input-group">
                <label for="passwordConfirm">Passwort wiederholen</label>
                <input type="password" id="passwordConfirm" name="passwordConfirm" required minlength="8" placeholder="••••••••" />
            </div>

            <button type="submit" class="btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Wird gespeichert...' : 'Passwort speichern'}
            </button>
        </form>
    </div>
</div>

<style>
    /* Globales Styling für das Layout und den Hintergrund */
    

    /* Karte zentrieren */
    .reset-container { 
        display: flex; 
        justify-content: center; 
        align-items: center; 
        min-height: 100vh; 
        padding: 1rem; 
    }
    
    /* Moderne, seriöse Karten-Ästhetik */
    .reset-card { 
        background: #ffffff; 
        padding: 2.5rem; 
        border-radius: 12px; 
        box-shadow: 0 10px 25px rgba(0,0,0,0.05), 0 4px 6px -1px rgba(0,0,0,0.05); 
        width: 100%; 
        max-width: 400px; 
        border: 1px solid #e2e8f0; 
    }
    
    /* Header der Karte */
    .reset-header { 
        text-align: center; 
        margin-bottom: 2rem; 
    }
    .reset-header h1 { 
        margin: 0 0 0.5rem 0; 
        color: #3b82f6; /* Blau, passend zum "Passwort vergessen" Flow */
        font-size: 1.8rem; 
    }
    .reset-header p { 
        margin: 0; 
        color: #64748b; 
        font-size: 0.95rem; 
        line-height: 1.5; 
    }
    
    /* Fehlermeldung mit Animation */
    .error-message { 
        background: #fef2f2; 
        color: #b91c1c; 
        padding: 0.8rem; 
        border-radius: 6px; 
        border: 1px solid #fecaca; 
        font-size: 0.9rem; 
        text-align: center; 
        font-weight: 600; 
        margin-bottom: 1.5rem; 
        animation: shake 0.4s ease-in-out;
    }

    @keyframes shake { 
        0%, 100% { transform: translateX(0); } 
        20% { transform: translateX(-6px); } 
        40% { transform: translateX(6px); } 
        60% { transform: translateX(-6px); } 
        80% { transform: translateX(6px); } 
    }
    
    /* Formular-Layout */
    .reset-form { 
        display: flex; 
        flex-direction: column; 
        gap: 1.2rem; 
    }
    .input-group { 
        display: flex; 
        flex-direction: column; 
        gap: 0.4rem; 
    }
    label { 
        font-size: 0.85rem; 
        font-weight: 600; 
        color: #64748b; 
    }
    
    /* Eingabefelder */
    input { 
        padding: 0.8rem; 
        border: 1px solid #cbd5e1; 
        border-radius: 6px; 
        font-size: 1rem; 
        background: #f8fafc; 
        color: #334155; 
        transition: all 0.2s; 
        box-sizing: border-box; 
        width: 100%; 
    }
    input::placeholder { color: #94a3b8; }
    input:focus { 
        outline: none; 
        border-color: #3b82f6; 
        background: #ffffff; 
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); 
    }
    
    /* Button */
    .btn-primary { 
        background: #3b82f6; 
        color: #ffffff; 
        padding: 0.8rem; 
        border: none; 
        border-radius: 6px; 
        font-weight: 700; 
        font-size: 1rem; 
        cursor: pointer; 
        transition: all 0.2s; 
        margin-top: 0.5rem; 
    }
    .btn-primary:hover:not(:disabled) { 
        background: #2563eb; 
        transform: translateY(-1px); 
    }
    .btn-primary:disabled { 
        background: #94a3b8; 
        cursor: not-allowed; 
    }
</style>