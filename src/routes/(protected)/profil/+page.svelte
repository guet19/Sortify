<script>
    import { enhance } from '$app/forms';
    import { page } from '$app/stores';
    import { browser } from '$app/environment';
    
    export let data;
    export let form;
    
    const { profileData, is2FAEnabled, qrCodeUrl, tempSecret } = data;

    let showEmailModal = false;
    let showPasswordModal = false;

    $: if (profileData.mustChangePassword) showPasswordModal = true;
    $: if (form?.emailError) showEmailModal = true;
    $: if (form?.pwError && !profileData.mustChangePassword) showPasswordModal = true;

    const countriesList = [
        "Schweiz",
        "Deutschland",
        "Österreich",
        "Andere"
    ];

    let showEmailChanged = false;
    let showEmailError = '';
    let showPasswordChanged = false;
    let showPwError = '';

    $: if ($page.url.searchParams.get('emailChanged') === 'true') {
        showEmailChanged = true;
        if (browser) cleanUrl('emailChanged');
        setTimeout(() => showEmailChanged = false, 5000);
    }
    
    $: if ($page.url.searchParams.get('emailError')) {
        showEmailError = $page.url.searchParams.get('emailError');
        if (browser) cleanUrl('emailError');
        setTimeout(() => showEmailError = '', 6000);
    }

    $: if ($page.url.searchParams.get('passwordChanged') === 'true') {
        showPasswordChanged = true;
        if (browser) cleanUrl('passwordChanged');
        setTimeout(() => showPasswordChanged = false, 5000);
    }
    
    $: if ($page.url.searchParams.get('pwError')) {
        showPwError = $page.url.searchParams.get('pwError');
        if (browser) cleanUrl('pwError');
        setTimeout(() => showPwError = '', 6000);
    }

    function cleanUrl(param) {
        const url = new URL(window.location.href);
        url.searchParams.delete(param);
        window.history.replaceState({}, '', url);
    }
</script>

<div class="page-container space-grotesk">
    <div class="header">
        <h1>Benutzerprofil</h1>
    </div>

    <div class="profile-card mb-4">
        <h2 class="h3-style mb-3">Sicherheit & Login</h2>
        
        {#if showEmailChanged} <div class="alert success">Die E-Mail-Adresse wurde erfolgreich verknüpft!</div> {/if}
        {#if showEmailError} <div class="alert error">{showEmailError}</div> {/if}
        {#if form?.emailSuccess} <div class="alert success">{form.emailSuccess}</div> {/if}
        
        {#if showPasswordChanged} <div class="alert success">Dein Passwort wurde erfolgreich geändert!</div> {/if}
        {#if showPwError} <div class="alert error">{showPwError}</div> {/if}
        {#if form?.pwSuccess} <div class="alert success">{form.pwSuccess}</div> {/if}

        <div class="data-list">
            <div class="data-row">
                <div class="data-info">
                    <span class="data-label">Konto-Rolle</span>
                    <div class="mt-1">
                        {#if profileData.role === 'admin'}
                            <span class="badge badge-success">Administrator</span>
                        {:else if profileData.role === 'manager'}
                            <span class="badge badge-primary" style="background: #3b82f6; color: white;">Manager</span>
                        {:else}
                            <span class="badge badge-secondary">Benutzer</span>
                        {/if}
                    </div>
                </div>
            </div>

            <div class="data-row">
                <div class="data-info">
                    <span class="data-label">E-Mail-Adresse</span>
                    
                    {#if profileData.email}
                        <strong class="data-value">{profileData.email}</strong>
                    {:else}
                        <strong class="data-value" style="color: #64748b; font-style: italic; font-weight: 400;">Keine E-Mail verknüpft</strong>
                    {/if}

                    {#if profileData.pendingEmail}
                        <div class="pending-notice mt-2">
                            <strong>Wartet auf Bestätigung:</strong> Link an <em>{profileData.pendingEmail}</em> gesendet.
                        </div>
                    {/if}
                </div>
                
                <button class="btn-outline" on:click={() => showEmailModal = true}>
                    {profileData.email ? 'Ändern' : 'Hinzufügen'}
                </button>
            </div>

            <div class="data-row border-none">
                <div class="data-info">
                    <span class="data-label">Passwort</span>
                    <strong class="data-value">••••••••••••</strong>
                    {#if profileData.hasPendingPassword}
                        <div class="pending-notice mt-2">
                            <strong>Wartet auf Bestätigung:</strong> Link zur Passwort-Aktivierung wurde gesendet.
                        </div>
                    {/if}
                </div>
                <button class="btn-outline" on:click={() => showPasswordModal = true}>Ändern</button>
            </div>
        </div>
    </div>

    <div class="profile-card mb-4">
        <h2 class="h3-style mb-3">Persönliche Daten</h2>

        {#if form?.success && !form?.emailSuccess && !form?.pwSuccess}
            <div class="alert success">{form.message}</div>
        {/if}
        {#if form?.error && !form?.emailError && !form?.pwError}
            <div class="alert error">{form.error}</div>
        {/if}

        <form method="POST" action="?/updateProfile" use:enhance class="profile-form">
            <div class="form-row">
                <div class="input-group">
                    <label for="firstName">Vorname</label>
                    <input type="text" id="firstName" name="firstName" value={profileData.firstName} required />
                </div>
                
                <div class="input-group">
                    <label for="lastName">Nachname</label>
                    <input type="text" id="lastName" name="lastName" value={profileData.lastName} required />
                </div>
            </div>

            <div class="form-row">
                <div class="input-group">
                    <label for="country">Land</label>
                    <select id="country" name="country">
                        <option value="" disabled selected={!profileData.country}>Bitte wählen...</option>
                        {#each countriesList as country}
                            <option value={country} selected={profileData.country === country}>{country}</option>
                        {/each}
                        {#if profileData.country && !countriesList.includes(profileData.country)}
                            <option value={profileData.country} selected>{profileData.country}</option>
                        {/if}
                    </select>
                </div>
                
                <div class="input-group">
                    <label for="birthDate">Geburtsdatum</label>
                    <input type="date" id="birthDate" name="birthDate" value={profileData.birthDate} />
                </div>
            </div>

            <div class="form-actions">
                <button type="submit" class="btn-primary">Änderungen speichern</button>
            </div>
        </form>
    </div>

    <div class="profile-card">
        <div class="two-factor-header">
            <h2 class="h3-style">Authenticator App (2FA)</h2>
            {#if profileData.email}
                {#if is2FAEnabled}
                    <span class="badge badge-success">Aktiviert</span>
                {:else}
                    <span class="badge badge-secondary">Deaktiviert</span>
                {/if}
            {/if}
        </div>

        {#if !profileData.email}
            <div class="alert warning mb-0" style="background: #f8fafc; color: #64748b; border: 1px dashed #cbd5e1;">
                Die Zwei-Faktor-Authentifizierung steht nur zur Verfügung, wenn deinem Konto eine E-Mail-Adresse zugewiesen ist. Verknüpfe oben eine E-Mail-Adresse, um diese Funktion freizuschalten.
            </div>
        {:else if is2FAEnabled}
            <p class="text-muted">
                Dein Konto ist durch die Zwei-Faktor-Authentifizierung geschützt. Bei jedem Login wird zusätzlich zu deinem Passwort ein Code aus deiner Authenticator-App abgefragt.
            </p>
            <form method="POST" action="?/disable2FA" use:enhance={() => {
                return async ({ result }) => { if (result.type === 'success') window.location.reload(); };
            }}>
                <button type="submit" class="btn-danger" on:click={(e) => !confirm('Möchtest du 2FA wirklich deaktivieren? Dein Konto ist danach weniger geschützt.') && e.preventDefault()}>
                    2FA deaktivieren
                </button>
            </form>
        {:else}
            <p class="text-muted">
                Schütze dein Konto zusätzlich. Scanne den QR-Code mit einer App wie <strong>Microsoft Authenticator</strong> oder <strong>Google Authenticator</strong> ab und gib anschließend den generierten 6-stelligen Code ein.
            </p>

            <div class="qr-container">
                <img src={qrCodeUrl} alt="2FA QR Code" class="qr-image" />
                <p class="qr-secret">Manuelle Eingabe: <strong>{tempSecret}</strong></p>
            </div>

            <form method="POST" action="?/enable2FA" use:enhance={() => {
                return async ({ result, update }) => {
                    await update();
                    if (result.type === 'success') window.location.reload();
                };
            }} class="two-factor-form">
                <input type="hidden" name="tempSecret" value={tempSecret} />
                
                <div class="input-group">
                    <label for="code">6-stelligen Code eingeben</label>
                    <input type="text" id="code" name="code" class="code-input" placeholder="123 456" maxlength="7" autocomplete="off" required />
                </div>
                
                <button type="submit" class="btn-primary w-100 mt-2">Verifizieren & Aktivieren</button>
            </form>
        {/if}
    </div>
</div>

{#if showEmailModal}
    <div class="modal-backdrop space-grotesk" on:click|self={() => showEmailModal = false}>
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="m-0">{profileData.email ? 'E-Mail-Adresse ändern' : 'E-Mail-Adresse verknüpfen'}</h3>
                <button class="btn-close" on:click={() => showEmailModal = false}>&times;</button>
            </div>
            <div class="modal-body">
                {#if form?.emailError}
                    <div class="alert error">{form.emailError}</div>
                {/if}
                <form method="POST" action="?/requestEmailChange" use:enhance={() => {
                    return async ({ result, update }) => {
                        await update();
                        if (result.type === 'success') showEmailModal = false;
                    };
                }}>
                    <div class="input-group mb-3">
                        <label for="currentPasswordEmail">Aktuelles Passwort zur Bestätigung</label>
                        <input type="password" id="currentPasswordEmail" name="currentPassword" required autofocus />
                    </div>

                    <div class="input-group mb-4">
                        <label for="newEmail">{profileData.email ? 'Neue E-Mail-Adresse' : 'Deine E-Mail-Adresse'}</label>
                        <input type="email" id="newEmail" name="newEmail" placeholder="name@email.ch" required />
                    </div>

                    <div class="d-flex justify-content-end gap-2">
                        <button type="button" class="btn-outline" on:click={() => showEmailModal = false}>Abbrechen</button>
                        <button type="submit" class="btn-primary">Bestätigungslink anfordern</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
{/if}

{#if showPasswordModal}
    <div class="modal-backdrop space-grotesk" on:click|self={() => { if (!profileData.mustChangePassword) showPasswordModal = false; }}>
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="m-0">Passwort ändern</h3>
                {#if !profileData.mustChangePassword}
                    <button class="btn-close" on:click={() => showPasswordModal = false}>&times;</button>
                {/if}
            </div>
            <div class="modal-body">
                {#if profileData.mustChangePassword}
                    <div class="alert warning mb-3" style="background: #fffbeb; color: #b45309; border: 1px solid #fcd34d;">
                        Bitte ändere dein vom Administrator vergebenes temporäres Passwort, um dein Konto zu sichern und Sortify nutzen zu können.
                    </div>
                {/if}

                {#if form?.pwError}
                    <div class="alert error">{form.pwError}</div>
                {/if}
                
                <form id="passwordChangeForm" method="POST" action="?/requestPasswordChange" use:enhance={() => {
                    return async ({ result, update }) => {
                        await update();
                        if (result.type === 'success') {
                            showPasswordModal = false;
                            window.location.reload();
                        }
                    };
                }}>
                    <div class="input-group mb-3">
                        <label for="currentPassword">Aktuelles Passwort</label>
                        <input type="password" id="currentPassword" name="currentPassword" required autofocus />
                    </div>
                    <div class="input-group mb-3">
                        <label for="newPassword">Neues Passwort</label>
                        <input type="password" id="newPassword" name="newPassword" minlength="8" required />
                    </div>
                    <div class="input-group mb-4">
                        <label for="confirmPassword">Neues Passwort bestätigen</label>
                        <input type="password" id="confirmPassword" name="confirmPassword" minlength="8" required />
                    </div>
                </form>
                
                <div class="d-flex justify-content-end gap-2 mt-4">
                    {#if profileData.mustChangePassword}
                        <form method="POST" action="?/cancelPasswordChange">
                            <button type="submit" class="btn-outline" style="color: #ef4444; border-color: #fca5a5;">
                                Abbrechen & Abmelden
                            </button>
                        </form>
                    {:else}
                        <button type="button" class="btn-outline" on:click={() => showPasswordModal = false}>Abbrechen</button>
                    {/if}
                    <button type="submit" form="passwordChangeForm" class="btn-primary">Passwort speichern</button>
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .page-container { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; color: #334155; }
    .header { margin-bottom: 2rem; }
    h1 { color: #22c55e; margin: 0; }
    .m-0 { margin: 0; }
    
    .profile-card { background: #ffffff; padding: 2rem; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    
    .mb-4 { margin-bottom: 2rem; }
    .mb-3 { margin-bottom: 1.5rem; }
    .mb-0 { margin-bottom: 0; }
    .mt-4 { margin-top: 2rem; }
    .mt-3 { margin-top: 1.5rem; }
    .mt-2 { margin-top: 0.75rem; }
    .mt-1 { margin-top: 1rem; }
    .d-flex { display: flex; }
    .justify-content-end { justify-content: flex-end; }
    .gap-2 { gap: 0.75rem; }
    .w-100 { width: 100%; }
    .w-50 { width: 50%; }

    .data-list { display: flex; flex-direction: column; }
    .data-row { display: flex; justify-content: space-between; align-items: center; padding: 1.25rem 0; border-bottom: 1px solid #e2e8f0; }
    .data-row.border-none { border-bottom: none; padding-bottom: 0; }
    .data-info { display: flex; flex-direction: column; gap: 0.25rem; }
    .data-label { font-size: 0.85rem; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .data-value { font-size: 1.1rem; color: #1e293b; }

    .pending-notice { background: #fffbeb; color: #b45309; padding: 0.8rem; border-left: 4px solid #f59e0b; font-size: 0.9rem; border-radius: 0 4px 4px 0; }

    .profile-form { display: flex; flex-direction: column; gap: 1.5rem; }
    .form-row { display: flex; gap: 1.5rem; flex-wrap: wrap; }
    .input-group { display: flex; flex-direction: column; gap: 0.4rem; flex: 1; min-width: 250px; }
    label { font-size: 0.85rem; font-weight: 600; color: #64748b; }
    input, select { padding: 0.7rem; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 1rem; background: #f8fafc; color: #334155; transition: all 0.2s; box-sizing: border-box; font-family: inherit; }
    input:focus, select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1); background: #ffffff; }
    select { cursor: pointer; }

    .form-actions { margin-top: 1rem; display: flex; justify-content: flex-end; padding-top: 1.5rem; border-top: 1px solid #e2e8f0; }
    
    .btn-primary { background: #3b82f6; color: white; padding: 0.7rem 1.5rem; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; transition: background 0.2s; font-family: inherit; }
    .btn-primary:hover { background: #2563eb; }
    .btn-danger { background: white; color: #ef4444; border: 1px solid #ef4444; padding: 0.7rem 1.5rem; border-radius: 6px; font-weight: 600; cursor: pointer; transition: all 0.2s; font-family: inherit;}
    .btn-danger:hover { background: #fef2f2; }
    .btn-outline { background: white; color: #334155; border: 1px solid #cbd5e1; padding: 0.6rem 1.25rem; border-radius: 6px; font-weight: 600; cursor: pointer; transition: all 0.2s; font-family: inherit;}
    .btn-outline:hover { background: #f1f5f9; border-color: #94a3b8; }

    .alert { padding: 1rem; border-radius: 6px; margin-bottom: 1.5rem; font-weight: 500; }
    .success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .error { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }

    .two-factor-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    .h3-style { margin: 0; font-size: 1.25rem; color: #1e293b; }
    .badge { padding: 0.35rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
    .badge-success { background: #dcfce7; color: #166534; }
    .badge-secondary { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
    .text-muted { color: #64748b; font-size: 0.95rem; line-height: 1.5; margin-bottom: 1.5rem; }
    
    .qr-container { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.5rem; text-align: center; margin-bottom: 1.5rem; }
    .qr-image { width: 180px; height: 180px; margin-bottom: 1rem; border-radius: 4px; }
    .qr-secret { margin: 0; font-size: 0.85rem; color: #64748b; font-family: monospace; }
    .code-input { text-align: center; letter-spacing: 5px; font-size: 1.5rem; font-family: monospace; padding: 0.8rem; }

    .modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.6); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 1rem; box-sizing: border-box; backdrop-filter: blur(3px); }
    .modal-content { background: #ffffff; width: 100%; max-width: 480px; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); overflow: hidden; animation: modalFadeIn 0.2s ease-out; }
    .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 1.25rem 1.5rem; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
    .btn-close { background: none; border: none; font-size: 1.75rem; line-height: 1; color: #64748b; cursor: pointer; padding: 0; margin-top: -5px; transition: color 0.2s; }
    .btn-close:hover { color: #0f172a; }
    .modal-body { padding: 1.5rem; }

    @keyframes modalFadeIn {
        from { opacity: 0; transform: translateY(10px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
    }
</style>