<script>
    import { enhance } from '$app/forms';
    export let data; 
    export let form;

    // Steuert, ob der E-Mail-Notfallbereich eingeklappt (false) oder ausgeklappt (true) ist
    let showBackupOptions = false;
</script>

<div class="container d-flex justify-content-center align-items-center" style="min-height: 80vh;">
    <div class="card shadow border-0" style="max-width: 450px; width: 100%;">
        <div class="card-body p-5 text-center">
            
            <div class="mb-4 text-primary">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="currentColor" class="bi bi-shield-lock" viewBox="0 0 16 16">
                  <path d="M5.338 1.59a61.44 61.44 0 0 0-2.837.856.481.481 0 0 0-.328.39c-.554 4.157.726 7.19 2.253 9.188a10.725 10.725 0 0 0 2.287 2.233c.346.244.652.42.893.533.12.057.218.095.293.118a.55.55 0 0 0 .101.025.615.615 0 0 0 .1-.025c.076-.023.174-.061.294-.118.24-.113.547-.29.893-.533a10.726 10.726 0 0 0 2.287-2.233c1.527-1.997 2.807-5.031 2.253-9.188a.48.48 0 0 0-.328-.39c-.651-.213-1.75-.56-2.837-.855C9.552 1.29 8.531 1.067 8 1.067c-.53 0-1.552.223-2.662.524zM5.072.56C6.157.265 7.31 0 8 0s1.843.265 2.928.56c1.11.3 2.229.655 2.887.87a1.54 1.54 0 0 1 1.044 1.262c.596 4.477-.787 7.795-2.465 9.99a11.775 11.775 0 0 1-2.517 2.453 7.159 7.159 0 0 1-1.048.625c-.28.132-.581.24-.829.24s-.548-.108-.829-.24a7.158 7.158 0 0 1-1.048-.625 11.777 11.777 0 0 1-2.517-2.453C1.928 10.463.545 7.145 1.14 2.692A1.54 1.54 0 0 1 2.185 1.43 62.456 62.456 0 0 1 5.072.56z"/>
                  <path d="M9.5 6.5a1.5 1.5 0 0 1-1 1.415l.385 1.99a.5.5 0 0 1-.491.595h-.788a.5.5 0 0 1-.49-.595l.384-1.99a1.5 1.5 0 1 1 2-1.415z"/>
                </svg>
            </div>

            <h3 class="h4 mb-3">Zwei-Faktor-Authentifizierung</h3>
            <p class="text-muted mb-4">Bitte gib den 6-stelligen Code aus deiner Authenticator-App (oder Notfall-E-Mail) ein.</p>

            {#if form?.error}
                <div class="alert alert-danger py-2">{form.error}</div>
            {/if}
            
            {#if form?.backupSuccess}
                <div class="alert alert-success py-2">{form.message}</div>
            {/if}

            <form method="POST" action="?/verify" use:enhance>
                <div class="mb-4">
                    <input 
                        type="text" 
                        name="code" 
                        class="form-control form-control-lg text-center" 
                        placeholder="123 456" 
                        maxlength="7"
                        autocomplete="one-time-code"
                        required 
                        style="letter-spacing: 5px; font-size: 1.5rem; font-family: monospace;"
                        autofocus
                    />
                </div>
                
                <button type="submit" class="btn btn-primary w-100 py-2 fw-bold">Anmelden</button>
            </form>

            {#if data.hasEmail}
                <div class="mt-4">
                    {#if !showBackupOptions}
                        <button 
                            type="button" 
                            class="btn btn-link small p-0" 
                            on:click={() => showBackupOptions = true}
                        >
                            Keinen Zugriff auf die Zwei-Faktor-Authentifizierung?
                        </button>
                    {:else}
                        <div class="p-4 mt-3 rounded text-start" style="background-color: #f8fafc; border: 1px solid #e2e8f0;">
                            <form method="POST" action="?/requestBackup" use:enhance>
                                <button type="submit" class="btn btn-outline-primary w-100 mb-3 fw-bold bg-white">
                                    Per E-Mail anmelden
                                </button>
                            </form>
                            
                            <p class="text-danger fw-bold mb-1" style="font-size: 0.95rem;">Hinweis:</p>
                            
                            <p class="text-muted mb-0" style="font-size: 0.8rem; line-height: 1.5;">
                                Falls du allgemein keinen Zugriff mehr auf deine 2FA Konfiguration hast, kannst du nach dem Login per Mail deine 2FA in den Profileinstellungen sicher trennen und mit einem neuen 2FA neu verknüpfen.
                            </p>
                        </div>
                    {/if}
                </div>
            {/if}

            <div class="mt-4 pt-2">
                <a href="/login" class="text-decoration-none text-muted small">Zurück zum Login</a>
            </div>
        </div>
    </div>
</div>