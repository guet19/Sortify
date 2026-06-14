<script>
    import { enhance } from '$app/forms';
    export let data;
    export let form;
    
    // Daten aus der load-Funktion abgreifen
    const { profileData } = data;
</script>

<div class="page-container space-grotesk">
    <div class="header">
        <h1>Benutzerprofil</h1>
    </div>

    <div class="profile-card">
        <div class="profile-info">
            Eingeloggt als: <strong>{profileData.email}</strong> 
            <span class="info-badge">Die E-Mail-Adresse kann nicht geändert werden.</span>
        </div>

        {#if form?.success}
            <div class="alert success">{form.message}</div>
        {/if}
        {#if form?.error}
            <div class="alert error">{form.error}</div>
        {/if}

        <form method="POST" use:enhance class="profile-form">
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
                    <input type="text" id="country" name="country" value={profileData.country} placeholder="z.B. Schweiz" />
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
</div>

<style>
    .page-container { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; color: #334155; }
    .header { margin-bottom: 2rem; }
    h1 { color: #22c55e; margin: 0; }
    
    .profile-card { background: #ffffff; padding: 2rem; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    
    .profile-info { margin-bottom: 2rem; padding: 1rem; background: #f8fafc; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 0.95rem; }
    .info-badge { display: block; font-size: 0.8rem; color: #64748b; margin-top: 0.3rem; }

    .profile-form { display: flex; flex-direction: column; gap: 1.5rem; }
    .form-row { display: flex; gap: 1.5rem; flex-wrap: wrap; }
    
    .input-group { display: flex; flex-direction: column; gap: 0.4rem; flex: 1; min-width: 250px; }
    label { font-size: 0.85rem; font-weight: 600; color: #64748b; }
    input { padding: 0.6rem; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 1rem; background: #f8fafc; color: #334155; transition: all 0.2s; }
    input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1); background: #ffffff; }

    .form-actions { margin-top: 1rem; display: flex; justify-content: flex-end; padding-top: 1.5rem; border-top: 1px solid #e2e8f0; }
    .btn-primary { background: #3b82f6; color: white; padding: 0.7rem 1.5rem; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
    .btn-primary:hover { background: #2563eb; }

    .alert { padding: 1rem; border-radius: 6px; margin-bottom: 1.5rem; font-weight: 500; }
    .success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .error { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
</style>