<script>
    import { enhance } from '$app/forms';
    export let form;
</script>

<svelte:head>
    <title>Passwort vergessen | Sortify Inventar</title>
</svelte:head>

<div class="login-container space-grotesk">
    <div class="login-card">
        <div class="login-header">
            <h1>Passwort vergessen?</h1>
            <p>Gib deine E-Mail-Adresse ein. Wir senden dir einen Link, um dein Passwort zurückzusetzen.</p>
        </div>

        {#if form?.success}
            <div class="success-banner">
                Falls ein Account mit dieser E-Mail existiert, haben wir dir einen Link zum Zurücksetzen gesendet. Bitte prüfe auch deinen Spam-Ordner.
            </div>
            <a href="/login" class="btn-secondary">Zurück zum Login</a>
        {:else}
            <form method="POST" use:enhance class="login-form">
                <div class="input-group">
                    <label for="email">E-Mail Adresse</label>
                    <input type="email" id="email" name="email" required placeholder="name@beispiel.ch" />
                </div>

                {#if form?.error}
                    <div class="error-message">{form.error}</div>
                {/if}

                <button type="submit" class="btn-blue">Link anfordern</button>
                <a href="/login" class="btn-ghost">Abbrechen</a>
            </form>
        {/if}
    </div>
</div>

<style>
    /* Generelles Body-Styling für den Hintergrund */
    .body { 
        font-family: 'Space Grotesk', sans-serif; 
        margin: 0;
    }

    /* Erfolgs- & Fehlermeldungen */
    .success-banner { background: #dcfce7; color: #166534; padding: 0.8rem; border-radius: 6px; border: 1px solid #bbf7d0; font-size: 0.95rem; text-align: center; font-weight: 600; margin-bottom: 1.5rem; animation: slideDown 0.3s ease-out; }
    .error-message { background: #fef2f2; color: #b91c1c; padding: 0.8rem; border-radius: 6px; border: 1px solid #fecaca; font-size: 0.9rem; text-align: center; font-weight: 600; margin-bottom: 1.5rem; animation: shake 0.4s ease-in-out; }
    
    @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-6px); } 80% { transform: translateX(6px); } }

    /* Layout & Weisse Karte auf dunklem Grund */
    .login-container { display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 1rem; }
    .login-card { background: #ffffff; padding: 2.5rem; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.05), 0 4px 6px -1px rgba(0,0,0,0.05); width: 100%; max-width: 400px; border: 1px solid #e2e8f0; }
    
    /* Texte innerhalb der Karte */
    .login-header { text-align: center; margin-bottom: 2rem; }
    .login-header h1 { margin: 0 0 0.5rem 0; color: #3b82f6; font-size: 1.8rem; } /* H1 ist hier blau statt grün */
    .login-header p { margin: 0; color: #64748b; font-size: 0.95rem; line-height: 1.5; }
    
    /* Formular & Helle Inputs */
    .login-form { display: flex; flex-direction: column; gap: 1.2rem; }
    .input-group { display: flex; flex-direction: column; gap: 0.4rem; }
    label { font-size: 0.85rem; font-weight: 600; color: #64748b; }
    
    input { padding: 0.8rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem; background: #f8fafc; color: #334155; transition: all 0.2s; box-sizing: border-box; width: 100%; }
    input::placeholder { color: #94a3b8; }
    input:focus { outline: none; border-color: #3b82f6; background: #ffffff; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); } /* Fokus ist hier ebenfalls blau */
    
    /* Spezifische Buttons für diese Seite */
    .btn-blue { background: #3b82f6; color: #ffffff; padding: 0.8rem; border: none; border-radius: 6px; font-weight: 700; font-size: 1rem; cursor: pointer; transition: all 0.2s; margin-top: 0.5rem; }
    .btn-blue:hover { background: #2563eb; transform: translateY(-1px); }

    .btn-secondary { display: block; text-align: center; text-decoration: none; background: transparent; color: #3b82f6; padding: 0.8rem; border: 1px solid #3b82f6; border-radius: 6px; font-weight: 600; font-size: 1rem; transition: all 0.2s; margin-top: 1rem; }
    .btn-secondary:hover { background: #eff6ff; }

    /* Der Abbrechen-Button (Ghost-Button) */
    .btn-ghost { display: block; text-align: center; text-decoration: none; background: transparent; color: #64748b; padding: 0.8rem; border: none; border-radius: 6px; font-weight: 600; font-size: 0.95rem; transition: all 0.2s; }
    .btn-ghost:hover { color: #334155; background: #f1f5f9; }
</style>