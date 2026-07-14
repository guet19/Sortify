<script>
    import { enhance } from '$app/forms';
    import { jsPDF } from 'jspdf';

    export let data;
    export let form;

    // 🔥 FIX: Reaktivität!
    $: members = data.members || [];
    $: currentUserRole = data.currentUserRole;
    $: roles = data.roles || [];

    // Filtert Admin und User aus den anpassbaren Rollen heraus
    $: customRoles = roles.filter(r => r.roleId !== 'admin' && r.roleId !== 'user');

    // Prüft, ob der aktuelle Nutzer Rollen verwalten darf
    $: canManageRoles = currentUserRole === 'admin' || (
        roles.find(r => r.roleId === currentUserRole)?.allowedRoutes?.includes('*') || 
        roles.find(r => r.roleId === currentUserRole)?.allowedRoutes?.some(route => '/einstellungen/authorization'.startsWith(route))
    );

    // Variablen für das Rollen-Änderungs-Modal
    let isRoleModalOpen = false;
    let roleChangeData = {
        userId: '',
        userName: '',
        newRoleValue: '',
        newRoleText: '',
        formElement: null
    };

    function openRoleModal(e, member) {
        e.preventDefault();
        
        roleChangeData = {
            userId: member.id,
            userName: member.username || member.firstName || member.email || 'diesem Mitglied',
            newRoleValue: e.target.value,
            newRoleText: e.target.options[e.target.selectedIndex].text,
            formElement: e.target.form
        };

        e.target.value = member.role;
        isRoleModalOpen = true;
    }

    function confirmRoleChange() {
        if (roleChangeData.formElement) {
            const selectEl = roleChangeData.formElement.querySelector('select[name="newRole"]');
            if (selectEl) selectEl.value = roleChangeData.newRoleValue;
            roleChangeData.formElement.requestSubmit();
        }
        isRoleModalOpen = false;
    }

    function cancelRoleChange() {
        isRoleModalOpen = false;
    }

    // 🔥 NEU: Variablen und Funktionen für das Farb-Pop-up (Modal)
    let isColorModalOpen = false;
    let colorChangeData = {
        userId: '',
        userName: '',
        newColor: ''
    };

    function openColorModal(member) {
        colorChangeData = {
            userId: member.id,
            userName: member.username || member.firstName || member.email || 'diesem Mitglied',
            newColor: member.color || '#3b82f6'
        };
        isColorModalOpen = true;
    }

    function cancelColorModal() {
        isColorModalOpen = false;
    }

    function downloadCredentialsPDF() {
        if (!form?.username || !form?.plainPassword) return;

        const doc = new jsPDF();
        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.setTextColor(34, 197, 94);
        doc.text("Sortify - System-Zugang", 20, 30);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(14);
        doc.setTextColor(51, 65, 85);
        doc.text("Ein neues lokales Benutzerkonto wurde für dich erstellt.", 20, 45);
        doc.setFontSize(12);
        doc.text("Bitte melde dich mit den folgenden Zugangsdaten an der App an.", 20, 55);
        doc.text("Wichtig: Du wirst beim ersten Login aufgefordert, dieses", 20, 62);
        doc.text("temporäre Passwort durch ein eigenes, sicheres Passwort zu ersetzen.", 20, 69);
        doc.setFillColor(248, 250, 252);
        doc.rect(20, 80, 170, 35, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.rect(20, 80, 170, 35, 'S');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(15, 23, 42);
        doc.text(`Benutzername:`, 25, 93);
        doc.text(`Temporäres Passwort:`, 25, 104);
        doc.setFont("helvetica", "normal");
        doc.text(form.username, 75, 93);
        doc.text(form.plainPassword, 75, 104);
        doc.setFontSize(10);
        doc.setTextColor(148, 163, 184);
        doc.text("Bitte behandle dieses Dokument vertraulich und vernichte es nach der Erstanmeldung.", 20, 135);
        doc.text(`Erstellt am: ${new Date().toLocaleDateString('de-CH')}`, 20, 142);
        doc.save(`Sortify_Zugangsdaten_${form.username}.pdf`);
    }
</script>

<div class="page-container space-grotesk">
    <div class="header mb-4">
        <h1>Teamverwaltung</h1>
        {#if canManageRoles}
            <a href="/einstellungen/authorization" class="btn-outline flex-center" title="Rollen und Berechtigungen verwalten">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon-sm" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Rollen verwalten
            </a>
        {/if}
    </div>

    {#if currentUserRole === 'admin'}
        <div class="admin-actions-grid">
            
            <div class="profile-card">
                <h2 class="h3-style mb-3">Lokalen Mitarbeiter anlegen</h2>
                <p class="text-muted mb-4" style="min-height: 42px;">
                    Account ohne E-Mail. Zugangsdaten können als PDF exportiert werden.
                </p>

                {#if form?.localError}
                    <div class="alert error">{form.localError}</div>
                {/if}

                {#if form?.success && form?.type === 'local'}
                    <div class="alert success mb-3">Konto <strong>{form.username}</strong> erzeugt!</div>
                    <button class="btn-primary w-100" on:click={downloadCredentialsPDF}>
                        📄 PDF herunterladen
                    </button>
                    <form method="GET" class="mt-2">
                        <button type="submit" class="btn-outline w-100">Weiteren anlegen</button>
                    </form>
                {:else}
                    <form method="POST" action="?/createLocalUser" use:enhance class="profile-form">
                        <div class="input-group">
                            <label for="username">Benutzername</label>
                            <input type="text" id="username" name="username" placeholder="z.B. lager_schmidt" required autocomplete="off" />
                        </div>
                        <div class="input-group">
                            <label for="roleLocal">Rolle im System</label>
                            <select id="roleLocal" name="role" required>
                                <option value="admin" selected={customRoles.length === 0}>Administrator (Alle Rechte)</option>
                                {#each customRoles as role, i}
                                    <option value={role.roleId} selected={i === 0}>{role.name}</option>
                                {/each}
                            </select>
                        </div>
                        <div class="input-group">
                            <label for="colorLocal">Terminal-Farbe (LED)</label>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <input type="color" id="colorLocal" name="color" value="#3b82f6" style="width: 50px; height: 40px; padding: 2px; cursor: pointer;">
                                <span class="text-sm text-gray-500">Diese Farbe leuchtet am Fach auf</span>
                            </div>
                        </div>
                        <button type="submit" class="btn-primary w-100 mt-2">Passwort generieren</button>
                    </form>
                {/if}
            </div>

            <div class="profile-card">
                <h2 class="h3-style mb-3">Mitglied per E-Mail einladen</h2>
                <p class="text-muted mb-4" style="min-height: 42px;">
                    Sendet einen Einladungslink. Falls das Konto existiert, wird es direkt freigeschaltet.
                </p>

                {#if form?.emailError}
                    <div class="alert error">{form.emailError}</div>
                {/if}

                {#if form?.success && form?.type === 'email'}
                    <div class="alert success mb-3">{form.message}</div>
                    <form method="GET" class="mt-2">
                        <button type="submit" class="btn-outline w-100">Weitere Person einladen</button>
                    </form>
                {:else}
                    <form method="POST" action="?/inviteEmailUser" use:enhance class="profile-form">
                        <div class="input-group">
                            <label for="email">E-Mail-Adresse</label>
                            <input type="email" id="email" name="email" placeholder="mitarbeiter@firma.ch" required />
                        </div>
                        <div class="input-group">
                            <label for="roleEmail">Rolle im System</label>
                            <select id="roleEmail" name="role" required>
                                <option value="admin" selected={customRoles.length === 0}>Administrator (Alle Rechte)</option>
                                {#each customRoles as role, i}
                                    <option value={role.roleId} selected={i === 0}>{role.name}</option>
                                {/each}
                            </select>
                        </div>
                        <div class="input-group">
                            <label for="colorEmail">Terminal-Farbe (LED)</label>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <input type="color" id="colorEmail" name="color" value="#10b981" style="width: 50px; height: 40px; padding: 2px; cursor: pointer;">
                                <span class="text-sm text-gray-500">Diese Farbe leuchtet am Fach auf</span>
                            </div>
                        </div>
                        <button type="submit" class="btn-primary w-100 mt-2">Einladung senden</button>
                    </form>
                {/if}
            </div>
        </div>
    {/if}

    <div class="profile-card">
        <h2 class="h3-style mb-4">Aktuelle Teammitglieder</h2>
        
        {#if form?.tableError}
            <div class="alert error mb-3">{form.tableError}</div>
        {/if}

        <div class="table-responsive">
            <table class="team-table">
                <thead>
                    <tr>
                        <th>Name / Kontakt</th>
                        <th>Konto-Typ</th>
                        <th>System-Rolle</th>
                        <th>Status</th>
                        <th>LED Farbe</th>
                        {#if currentUserRole === 'admin'}
                            <th class="text-right">Aktionen</th>
                        {/if}
                    </tr>
                </thead>
                <tbody>
                    {#each members as member}
                        {@const roleObj = roles.find(r => r.roleId === member.role) || 
                            (member.role === 'admin' ? { name: 'Administrator', allowedRoutes: ['*'] } : 
                            (member.role === 'user' ? { name: 'Benutzer (Legacy)', allowedRoutes: [] } : null))}
                        
                        <tr>
                            <td data-label="Name / Kontakt">
                                <div class="member-name-block">
                                    {#if member.firstName || member.lastName}
                                        <strong class="member-real-name">{member.firstName} {member.lastName}</strong>
                                        <span class="member-sub-info">{member.email || member.username}</span>
                                    {:else}
                                        <strong class="member-real-name">{member.username || member.email}</strong>
                                    {/if}
                                </div>
                            </td>
                            <td data-label="Konto-Typ">
                                {#if member.email}
                                    <span class="type-badge cloud">E-Mail Account</span>
                                {:else}
                                    <span class="type-badge local">Lokaler Account</span>
                                {/if}
                            </td>
                            <td data-label="System-Rolle">
                                <div class="role-wrapper">
                                    {#if currentUserRole === 'admin' && member.id !== data.currentUserId}
                                        <form 
                                            method="POST" 
                                            action="?/updateRole" 
                                            use:enhance={() => {
                                                return async ({ result }) => {
                                                    if (result.type === 'success') {
                                                        window.location.reload(); 
                                                    }
                                                };
                                            }}
                                        >
                                            <input type="hidden" name="targetUserId" value={member.id} />
                                            <select 
                                                name="newRole" 
                                                class="role-select" 
                                                on:change={(e) => openRoleModal(e, member)}
                                            >
                                                <option value="admin" selected={member.role === 'admin'}>Administrator</option>
                                                {#if member.role === 'user'}
                                                    <option value="user" selected>Benutzer (Legacy)</option>
                                                {/if}
                                                {#each customRoles as role}
                                                    <option value={role.roleId} selected={member.role === role.roleId}>
                                                        {role.name}
                                                    </option>
                                                {/each}
                                            </select>
                                        </form>
                                    {:else}
                                        {#if member.role === 'admin'}
                                            <span class="badge badge-success">Administrator</span>
                                        {:else if member.role === 'user'}
                                            <span class="badge badge-secondary">Benutzer (Legacy)</span>
                                        {:else}
                                            <span class="badge badge-secondary">{roleObj ? roleObj.name : member.role}</span>
                                        {/if}
                                    {/if}

                                    {#if roleObj}
                                        <div class="tooltip-container">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="info-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                              <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <div class="tooltip-content">
                                                <strong>Berechtigung für:</strong>
                                                <div class="mt-1">
                                                    {#if roleObj.allowedRoutes.includes('*')}
                                                        <span class="text-green-300">Vollzugriff (Alle Seiten)</span>
                                                    {:else if roleObj.allowedRoutes.length > 0}
                                                        <ul class="tooltip-list">
                                                            {#each roleObj.allowedRoutes as route}
                                                                <li>{route}</li>
                                                            {/each}
                                                        </ul>
                                                    {:else}
                                                        <span class="text-gray-400">Keine Zugriffe definiert</span>
                                                    {/if}
                                                </div>
                                            </div>
                                        </div>
                                    {/if}
                                </div>
                            </td>
                            <td data-label="Status">
                                {#if !member.isVerified}
                                    <span class="status-indicator pending">Einladung ausstehend</span>
                                {:else if member.mustChangePassword}
                                    <span class="status-indicator warning">PW-Wechsel ausstehend</span>
                                {:else}
                                    <span class="status-indicator active">Aktiv</span>
                                {/if}
                            </td>
                            
                            <!-- 🔥 NEU: Der Kreis ist nun klickbar und öffnet das Modal -->
                            <td data-label="LED Farbe">
                                {#if currentUserRole === 'admin'}
                                    <!-- eslint-disable-next-line a11y-click-events-have-key-events a11y-interactive-supports-focus -->
                                    <div 
                                        class="color-picker-wrapper" 
                                        title="Farbe ändern (Klick)" 
                                        role="button"
                                        on:click={() => openColorModal(member)}
                                        style="cursor: pointer; display: inline-block;"
                                    >
                                        <div class="color-circle" style="background-color: {member.color}; box-shadow: 0 0 8px {member.color}80;"></div>
                                    </div>
                                {:else}
                                    <div class="color-circle" style="background-color: {member.color}; box-shadow: 0 0 8px {member.color}80;" title="Hex: {member.color}"></div>
                                {/if}
                            </td>

                            {#if currentUserRole === 'admin'}
                                <td class="text-right mobile-left" data-label="Aktionen">
                                    {#if member.id !== data.currentUserId}
                                        <form 
                                            method="POST" 
                                            action="?/removeUser" 
                                            use:enhance={() => {
                                                return async ({ result }) => {
                                                    if (result.type === 'success') {
                                                        window.location.reload();
                                                    }
                                                };
                                            }} 
                                            on:submit={(e) => !confirm(`Möchtest du ${member.username || member.email} wirklich aus dem System entfernen? ${!member.email ? 'Da es sich um einen lokalen Account handelt, wird dieser vollständig gelöscht.' : ''}`) && e.preventDefault()}
                                        >
                                            <input type="hidden" name="targetUserId" value={member.id} />
                                            <button type="submit" class="btn-icon-danger" title="Benutzer entfernen">
                                                🗑️
                                            </button>
                                        </form>
                                    {/if}
                                </td>
                            {/if}
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    </div>
</div>

<!-- Modal: Rollen ändern -->
{#if isRoleModalOpen}
    <div class="custom-modal-backdrop" on:click={cancelRoleChange}>
        <div class="custom-modal-box" on:click|stopPropagation>
            <div class="modal-header">
                <h3>Rolle ändern</h3>
                <button class="modal-close" on:click={cancelRoleChange}>&times;</button>
            </div>
            <div class="modal-body">
                <p>Möchtest du die Rolle von <strong>{roleChangeData.userName}</strong> wirklich auf <strong class="text-highlight">"{roleChangeData.newRoleText}"</strong> ändern?</p>
                <p class="text-sm text-gray-500 mt-2">Die neuen Berechtigungen sind für den Benutzer sofort nach dem Neuladen aktiv.</p>
            </div>
            <div class="modal-actions">
                <button class="btn-outline" on:click={cancelRoleChange}>Abbrechen</button>
                <button class="btn-primary" on:click={confirmRoleChange}>Ja, Rolle ändern</button>
            </div>
        </div>
    </div>
{/if}

<!-- 🔥 NEU: Modal: LED Farbe ändern -->
{#if isColorModalOpen}
    <div class="custom-modal-backdrop" on:click={cancelColorModal}>
        <div class="custom-modal-box" on:click|stopPropagation style="max-width: 400px; text-align: center;">
            <div class="modal-header" style="justify-content: center; position: relative;">
                <h3 style="margin: 0 auto;">LED-Farbe ändern</h3>
                <button class="modal-close" on:click={cancelColorModal} style="position: absolute; right: 0;">&times;</button>
            </div>
            
            <form method="POST" action="?/updateColor" use:enhance={() => {
                return async ({ result }) => {
                    if (result.type === 'success') {
                        isColorModalOpen = false;
                        window.location.reload(); 
                    }
                };
            }}>
                <div class="modal-body" style="display: flex; flex-direction: column; align-items: center; gap: 1.5rem; margin-top: 1rem;">
                    <p style="margin: 0;">Wähle die neue Erkennungsfarbe für <br><strong>{colorChangeData.userName}</strong>:</p>
                    
                    <input type="hidden" name="targetUserId" value={colorChangeData.userId} />
                    
                    <!-- Großer, zentraler Farbwähler -->
                    <input 
                        type="color" 
                        name="newColor" 
                        bind:value={colorChangeData.newColor}
                        style="width: 120px; height: 120px; padding: 4px; cursor: pointer; border: 2px solid #cbd5e1; border-radius: 16px; background: none;"
                    />
                </div>
                <div class="modal-actions" style="justify-content: center; margin-top: 2rem;">
                    <button type="button" class="btn-outline" on:click={cancelColorModal}>Abbrechen</button>
                    <button type="submit" class="btn-primary">Speichern</button>
                </div>
            </form>
        </div>
    </div>
{/if}

<style>
    /* Layout & Cards */
    .page-container { max-width: 1000px; margin: 0 auto; padding: 2rem 1rem; color: #334155; }
    
    .header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
    h1 { color: #22c55e; margin: 0; }
    
    .h3-style { margin: 0; font-size: 1.25rem; color: #1e293b; }

    .profile-card { 
        background: #ffffff; 
        padding: 2rem; 
        border-radius: 8px; 
        border: 1px solid #e2e8f0; 
        box-shadow: 0 1px 3px rgba(0,0,0,0.05); 
        height: auto !important; 
        max-height: none !important;
        overflow: visible !important; 
    }
    
    .admin-actions-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem; }
    @media (max-width: 768px) { .admin-actions-grid { grid-template-columns: 1fr; } }

    /* Utilities */
    .mb-3 { margin-bottom: 1.5rem; }
    .mb-4 { margin-bottom: 2rem; }
    .mt-1 { margin-top: 0.25rem; }
    .mt-2 { margin-top: 0.75rem; }
    .w-100 { width: 100%; }
    .text-right { text-align: right; }
    .text-muted { color: #64748b; font-size: 0.95rem; line-height: 1.5; }
    .text-green-300 { color: #86efac; }
    .text-gray-400 { color: #9ca3af; }
    .text-gray-500 { color: #6b7280; }
    .text-sm { font-size: 0.85rem; }
    .text-highlight { color: #3b82f6; }

    /* Formulare */
    .profile-form { display: flex; flex-direction: column; gap: 1.2rem; }
    .input-group { display: flex; flex-direction: column; gap: 0.4rem; }
    label { font-size: 0.85rem; font-weight: 600; color: #64748b; }
    input, select { padding: 0.7rem; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 1rem; background: #f8fafc; color: #334155; box-sizing: border-box; font-family: inherit; }
    input[type="color"] { padding: 2px; }
    input:focus, select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1); background: #ffffff; }
    select { cursor: pointer; }

    .role-select { padding: 0.4rem; font-size: 0.85rem; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; color: #334155; cursor: pointer; width: auto; min-width: 120px; }
    .role-select:focus { border-color: #3b82f6; outline: none; }

    /* Rollen Wrapper & Tooltip */
    .role-wrapper { display: flex; align-items: center; gap: 8px; position: relative; flex-wrap: wrap; }
    .tooltip-container { display: flex; align-items: center; cursor: help; }
    .info-icon { width: 18px; height: 18px; color: #94a3b8; transition: color 0.2s; }
    .info-icon:hover { color: #3b82f6; }
    
    .tooltip-content {
        visibility: hidden;
        opacity: 0;
        position: absolute;
        top: 100%;
        left: 0;
        margin-top: 8px;
        background-color: #1e293b; 
        color: #f8fafc;
        padding: 12px 16px;
        border-radius: 6px;
        font-size: 0.85rem;
        width: max-content;
        max-width: 320px;
        z-index: 50;
        transition: opacity 0.2s, visibility 0.2s;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.1);
        pointer-events: none; 
    }

    .tooltip-container:hover + .tooltip-content,
    .tooltip-container:hover .tooltip-content,
    .info-icon:hover ~ .tooltip-content {
        visibility: visible;
        opacity: 1;
    }

    .tooltip-list { margin: 6px 0 0 0; padding-left: 18px; text-align: left; line-height: 1.5; }
    .tooltip-list li { margin-bottom: 4px; }

    /* Tabelle */
    .table-responsive { width: 100%; overflow: visible !important; height: auto !important; max-height: none !important; } 
    .team-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.95rem; }
    .team-table th { background: #f8fafc; padding: 1rem; color: #64748b; font-weight: 600; border-bottom: 2px solid #e2e8f0; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.5px; }
    .team-table td { padding: 1rem; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
    
    @media (max-width: 860px) {
        .team-table thead { display: none; }
        .team-table, .team-table tbody, .team-table tr, .team-table td { display: block; width: 100%; box-sizing: border-box; }
        .team-table tr { margin-bottom: 1.5rem; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; background: #fafafa; }
        .team-table td { padding: 0.75rem 0; border-bottom: 1px solid #e2e8f0; text-align: left; display: flex; flex-direction: column; gap: 6px; }
        .team-table td:last-child { border-bottom: none; padding-bottom: 0; }
        .team-table td::before { content: attr(data-label); font-size: 0.75rem; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 2px; }
        .mobile-left { text-align: left !important; }
    }
    
    .member-name-block { display: flex; flex-direction: column; }
    .member-real-name { color: #1e293b; font-size: 1rem; }
    .member-sub-info { font-size: 0.85rem; color: #64748b; }

    /* Badges & Indicators */
    .badge { padding: 0.35rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; display: inline-block; }
    .badge-success { background: #dcfce7; color: #166534; }
    .badge-secondary { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
    
    .type-badge { font-size: 0.8rem; font-weight: 500; padding: 0.25rem 0.5rem; border-radius: 4px; }
    .type-badge.cloud { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
    .type-badge.local { background: #f6f8fa; color: #24292f; border: 1px solid #d0d7de; }

    .status-indicator { font-size: 0.85rem; font-weight: 500; display: inline-flex; align-items: center; gap: 0.4rem; }
    .status-indicator.active { color: #166534; }
    .status-indicator.active::before { content: ""; display: inline-block; width: 8px; height: 8px; background: #22c55e; border-radius: 50%; }
    .status-indicator.warning { color: #9a3412; }
    .status-indicator.warning::before { content: ""; display: inline-block; width: 8px; height: 8px; background: #f97316; border-radius: 50%; }
    .status-indicator.pending { color: #3b82f6; }
    .status-indicator.pending::before { content: ""; display: inline-block; width: 8px; height: 8px; background: #60a5fa; border-radius: 50%; }

    /* Action Buttons & Links */
    .btn-primary { background: #3b82f6; color: white; padding: 0.7rem 1.5rem; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; transition: background 0.2s; font-family: inherit; display: inline-flex; justify-content: center; align-items: center; }
    .btn-primary:hover { background: #2563eb; }
    .btn-outline { background: white; color: #334155; border: 1px solid #cbd5e1; padding: 0.7rem 1.5rem; border-radius: 6px; font-weight: 600; cursor: pointer; transition: all 0.2s; font-family: inherit; text-decoration: none; display: inline-flex; justify-content: center; align-items: center; }
    .btn-outline:hover { background: #f1f5f9; border-color: #94a3b8; }
    
    .btn-icon-danger { background: none; border: none; font-size: 1.2rem; cursor: pointer; opacity: 0.6; transition: all 0.2s; padding: 0.3rem; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; }
    .btn-icon-danger:hover { opacity: 1; background: #fee2e2; }
    
    .flex-center { gap: 0.5rem; }
    .icon-sm { width: 20px; height: 20px; }
    
    .alert { padding: 1rem; border-radius: 6px; margin-bottom: 1.5rem; font-weight: 500; }
    .success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .error { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }

    /* CSS für den Color-Circle in der Tabelle */
    .color-circle { width: 24px; height: 24px; border-radius: 50%; border: 2px solid #e2e8f0; transition: transform 0.2s; }
    .color-picker-wrapper:hover .color-circle { transform: scale(1.15); }

    /* Modals */
    .custom-modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(15, 23, 42, 0.6); backdrop-filter: blur(2px); display: flex; justify-content: center; align-items: center; z-index: 9999; }
    .custom-modal-box { background: #ffffff; width: 90%; max-width: 450px; border-radius: 8px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); padding: 24px; position: relative; animation: modalIn 0.2s ease-out; }
    @keyframes modalIn { from { opacity: 0; transform: scale(0.95) translateY(-10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
    .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .modal-header h3 { margin: 0; font-size: 1.25rem; color: #1e293b; }
    .modal-close { background: none; border: none; font-size: 1.5rem; line-height: 1; color: #94a3b8; cursor: pointer; transition: color 0.2s; }
    .modal-close:hover { color: #ef4444; }
    .modal-body { margin-bottom: 24px; color: #334155; line-height: 1.5; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 12px; }
</style>