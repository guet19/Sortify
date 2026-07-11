<script>
    import { enhance } from '$app/forms';
    export let data;
    export let form;
</script>

<div class="container py-4 max-w-md mx-auto" style="max-width: 600px;">
    <div class="row mb-4">
        <div class="col">
            <h1 class="h2 mb-1">Sicherheit</h1>
            <p class="text-muted">Verwalte deine Kontosicherheit und die Zwei-Faktor-Authentifizierung (2FA).</p>
        </div>
    </div>

    {#if form?.error}
        <div class="alert alert-danger" role="alert">{form.error}</div>
    {/if}
    {#if form?.success}
        <div class="alert alert-success" role="alert">{form.success}</div>
    {/if}

    <div class="card shadow-sm border-0">
        <div class="card-body p-4">
            <div class="d-flex align-items-center justify-content-between mb-4">
                <h5 class="card-title mb-0">Authenticator App (2FA)</h5>
                {#if data.is2FAEnabled}
                    <span class="badge bg-success">Aktiviert</span>
                {:else}
                    <span class="badge bg-secondary">Deaktiviert</span>
                {/if}
            </div>

            {#if data.is2FAEnabled}
                <p class="text-muted mb-4">
                    Dein Konto ist durch die Zwei-Faktor-Authentifizierung geschützt. Bei jedem Login wird zusätzlich zu deinem Passwort ein Code aus deiner Authenticator-App abgefragt.
                </p>
                <form method="POST" action="?/disable2FA" use:enhance>
                    <button type="submit" class="btn btn-outline-danger" on:click={(e) => !confirm('Möchtest du 2FA wirklich deaktivieren? Dein Konto ist danach weniger geschützt.') && e.preventDefault()}>
                        2FA deaktivieren
                    </button>
                </form>

            {:else}
                <p class="text-muted mb-4">
                    Schütze dein Konto zusätzlich. Scanne den QR-Code mit einer App wie <strong>Microsoft Authenticator</strong>, <strong>Google Authenticator</strong> oder <strong>Authy</strong>.
                </p>

                <div class="text-center mb-4 bg-light p-3 rounded border">
                    <img src={data.qrCodeUrl} alt="2FA QR Code" class="img-fluid" style="width: 200px; height: 200px;" />
                    <p class="small text-muted mt-2 mb-0 font-monospace">Manuelle Eingabe: {data.tempSecret}</p>
                </div>

                <form method="POST" action="?/enable2FA" use:enhance>
                    <input type="hidden" name="tempSecret" value={data.tempSecret} />
                    
                    <div class="mb-3">
                        <label for="code" class="form-label fw-bold">6-stelligen Code eingeben</label>
                        <input 
                            type="text" 
                            id="code" 
                            name="code" 
                            class="form-control form-control-lg text-center letter-spacing-lg" 
                            placeholder="123 456" 
                            maxlength="7"
                            autocomplete="off"
                            required 
                            style="letter-spacing: 5px; font-size: 1.5rem;"
                        />
                    </div>
                    
                    <button type="submit" class="btn btn-primary w-100 py-2 fw-bold">
                        Verifizieren & Aktivieren
                    </button>
                </form>
            {/if}
        </div>
    </div>
</div>