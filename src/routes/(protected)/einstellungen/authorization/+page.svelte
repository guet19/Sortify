<script>
    export let data;
    export let form;

    // 🔥 NEU: Speichert alle aktuell angekreuzten Checkbox-Werte
    let selectedRoutePaths = [];

    // 🔥 NEU: Reagiert automatisch (Reaktivität), wenn sich Checkboxen ändern
    $: availableStartPages = data.availableRoutes.filter(route => 
        selectedRoutePaths.includes(route.path)
    );
</script>

<div class="page-container">
    
    <div class="page-header">
        <div>
            <h1 class="page-title">Rollenverwaltung</h1>
            <p class="page-description">Lege individuelle Rollen an und bestimme, auf welche Seiten die Mitarbeiter Zugriff haben.</p>
        </div>
        <a href="/einstellungen/team" class="btn-outline flex-center" title="Zurück zur Teamverwaltung">
            <svg xmlns="http://www.w3.org/2000/svg" class="icon-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Zurück zum Team
        </a>
    </div>

    {#if form?.error}
        <div class="error-alert">
            {form.error}
        </div>
    {/if}

    <div class="grid-layout">
        <!-- LINKE SPALTE: Neue Rolle erstellen -->
        <div class="panel">
            <h2 class="panel-title">Neue Rolle erstellen</h2>
            <form method="POST" action="?/createRole" class="role-form">
                <div class="form-group">
                    <label for="roleName">Rollenname</label>
                    <input type="text" id="roleName" name="roleName" placeholder="z.B. Schichtleiter" required>
                </div>

                <div class="form-group">
                    <label>Erlaubte Seiten (Zugriffsrechte)</label>
                    <div class="checkbox-container">
                        {#each data.availableRoutes as route}
                            <label class="checkbox-label">
                                <!-- 🔥 NEU: bind:group verknüpft die Checkboxen mit dem Array -->
                                <input type="checkbox" name="routes" value={route.path} bind:group={selectedRoutePaths}>
                                <span class="route-name">{route.name}</span>
                                <span class="route-path">({route.path})</span>
                            </label>
                        {/each}
                    </div>
                </div>

                <div class="form-group mt-2">
                    <label for="startPage">Startseite (nach Login)</label>
                    <!-- 🔥 NEU: Dropdown ist deaktiviert, solange nichts angekreuzt ist -->
                    <select id="startPage" name="startPage" class="select-input" required disabled={availableStartPages.length === 0}>
                        {#if availableStartPages.length === 0}
                            <option value="">Bitte zuerst Zugriffsrechte auswählen</option>
                        {:else}
                            <!-- 🔥 NEU: Dropdown nutzt das gefilterte Array -->
                            {#each availableStartPages as route}
                                <option value={route.path}>{route.name}</option>
                            {/each}
                        {/if}
                    </select>
                </div>

                <button type="submit" class="btn-submit mt-2">Rolle anlegen</button>
            </form>
        </div>

        <!-- RECHTE SPALTE: Bestehende Rollen -->
        <div class="roles-list-container">
            <h2 class="panel-title text-light">Aktuelle Systemrollen</h2>
            
            <div class="roles-grid">
                {#each data.roles as role}
                    <div class="role-card">
                        <div class="role-header">
                            <div class="role-info">
                                <h3>{role.name}</h3>
                                <span class="role-id">ID: {role.roleId} • Start: {role.startPage || '/'}</span>
                            </div>
                            
                            {#if !role.isSystemRole}
                                <form method="POST" action="?/deleteRole" class="delete-form">
                                    <input type="hidden" name="roleId" value={role.roleId}>
                                    <button type="submit" class="btn-delete" title="Rolle löschen">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                          <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                                        </svg>
                                    </button>
                                </form>
                            {:else}
                                <span class="system-badge">System</span>
                            {/if}
                        </div>
                        
                        <div class="role-routes">
                            <span class="routes-heading">Zugriff auf:</span>
                            <div class="badge-group">
                                {#if role.allowedRoutes.includes('*')}
                                    <span class="route-badge badge-all">Vollzugriff (Alle Seiten)</span>
                                {:else}
                                    {#each role.allowedRoutes as route}
                                        <span class="route-badge badge-specific">{route}</span>
                                    {/each}
                                {/if}
                            </div>
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    </div>
</div>

<style>
    .page-container { max-width: 1024px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 30px; }
    .page-header > div { flex: 1; }
    .page-title { color: #22c55e; font-size: 2rem; margin-bottom: 5px; margin-top: 0; }
    .page-description { color: #d1d5db; margin-bottom: 0; }
    
    .btn-outline { background: transparent; color: #d1d5db; border: 1px solid #4b5563; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 600; cursor: pointer; transition: all 0.2s; text-decoration: none; display: inline-flex; align-items: center; }
    .btn-outline:hover { background: #374151; color: #ffffff; border-color: #6b7280; }
    .flex-center { gap: 0.5rem; }
    .icon-sm { width: 18px; height: 18px; }

    .grid-layout { display: grid; grid-template-columns: 1fr; gap: 30px; }
    @media (min-width: 768px) { .grid-layout { grid-template-columns: 1fr 1fr; align-items: start; } }

    .panel { background-color: #ffffff; border-radius: 8px; padding: 24px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); color: #1f2937; }
    .panel-title { font-size: 1.25rem; font-weight: bold; margin-top: 0; margin-bottom: 20px; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; }
    .text-light { color: #f3f4f6; border-bottom: none; }

    .role-form { display: flex; flex-direction: column; gap: 20px; }
    .form-group label { display: block; font-size: 0.9rem; font-weight: 600; margin-bottom: 8px; color: #374151; }
    
    input[type="text"], .select-input { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-size: 1rem; background-color: #fff; font-family: inherit;}
    input[type="text"]:focus, .select-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2); }
    
    /* Etwas Feedback, wenn das Dropdown gesperrt ist */
    .select-input:disabled { background-color: #f3f4f6; color: #9ca3af; cursor: not-allowed; }

    .checkbox-container { background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; display: flex; flex-direction: column; gap: 12px; }
    .checkbox-label { display: flex; align-items: center; gap: 10px; cursor: pointer; }
    .checkbox-label input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; }
    .route-name { font-weight: 600; color: #1f2937; }
    .route-path { font-size: 0.8rem; color: #9ca3af; }

    .btn-submit { background-color: #3b82f6; color: white; border: none; padding: 12px 16px; border-radius: 6px; font-weight: bold; font-size: 1rem; cursor: pointer; transition: background-color 0.2s; width: 100%; }
    .btn-submit:hover { background-color: #2563eb; }
    .mt-2 { margin-top: 0.5rem; }

    .roles-grid { display: flex; flex-direction: column; gap: 15px; }
    .role-card { background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
    .role-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .role-info h3 { margin: 0 0 4px 0; font-size: 1.1rem; color: #111827; }
    .role-id { font-size: 0.75rem; color: #6b7280; font-family: monospace; }

    .btn-delete { background: none; border: none; color: #9ca3af; cursor: pointer; padding: 4px; width: 28px; height: 28px; transition: color 0.2s; }
    .btn-delete:hover { color: #ef4444; }
    .system-badge { background-color: #f3f4f6; color: #4b5563; font-size: 0.75rem; font-weight: 600; padding: 4px 8px; border-radius: 4px; }

    .role-routes { border-top: 1px solid #f3f4f6; padding-top: 12px; margin-top: 12px; }
    .routes-heading { display: block; font-size: 0.75rem; font-weight: bold; color: #9ca3af; text-transform: uppercase; margin-bottom: 8px; }
    .badge-group { display: flex; flex-wrap: wrap; gap: 8px; }
    .route-badge { font-size: 0.75rem; font-weight: 600; padding: 4px 10px; border-radius: 99px; }
    .badge-all { background-color: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .badge-specific { background-color: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
    .error-alert { background-color: #fee2e2; color: #b91c1c; padding: 16px; border-left: 4px solid #ef4444; border-radius: 4px; margin-bottom: 24px; font-weight: 500; }
</style>