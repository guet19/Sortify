<script>
    import { enhance } from '$app/forms';
    import { page } from '$app/stores';
    export let form;
</script>

<div class="verify-container space-grotesk">
    <div class="verify-card">
        <h2>E-Mail bestätigen</h2>
        <p>Wir haben einen 6-stelligen Code an <strong>{$page.url.searchParams.get('email')}</strong> gesendet.</p>
        
        <form method="POST" use:enhance>
            <input type="hidden" name="email" value={$page.url.searchParams.get('email')} />
            
            <div class="input-group">
                <input type="text" name="code" placeholder="123456" maxlength="6" class="code-input" required autocomplete="off" />
            </div>

            {#if form?.error}
                <div class="error-message">{form.error}</div>
            {/if}

            <button type="submit" class="btn-primary">Bestätigen</button>
        </form>
    </div>
</div>

<style>
    /* Layout & Weisse Karte */
    .verify-container { display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 1rem; }
    .verify-card { background: #ffffff; padding: 2.5rem; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); width: 100%; max-width: 450px; border: 1px solid #e2e8f0; text-align: center; }
    
    h2 { color: #22c55e; margin-top: 0; margin-bottom: 1rem; }
    p { color: #64748b; margin-bottom: 2rem; line-height: 1.5; }
    strong { color: #334155; }
    
    .input-group { margin-bottom: 1.5rem; }
    
    /* Grosses Code Feld */
    .code-input { width: 100%; padding: 1rem; background: #f8fafc; border: 2px solid #cbd5e1; border-radius: 8px; color: #16a34a; font-size: 2.5rem; letter-spacing: 0.5rem; text-align: center; font-family: monospace; font-weight: bold; transition: all 0.2s; box-sizing: border-box; }
    .code-input:focus { outline: none; border-color: #22c55e; background: #ffffff; box-shadow: 0 0 10px rgba(34, 197, 94, 0.15); }
    .code-input::placeholder { color: #cbd5e1; }

    /* Button */
    .btn-primary { width: 100%; background: #22c55e; color: #0B192C; padding: 1rem; border: none; border-radius: 6px; font-weight: 700; font-size: 1.1rem; cursor: pointer; transition: all 0.2s; }
    .btn-primary:hover { background: #16a34a; transform: translateY(-2px); }

    .error-message { background: #fef2f2; color: #b91c1c; padding: 0.8rem; border-radius: 6px; border: 1px solid #fecaca; font-size: 0.9rem; text-align: center; font-weight: 600; margin-bottom: 1.5rem; animation: shake 0.4s ease-in-out; }
    @keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-6px); } 80% { transform: translateX(6px); } }
</style>