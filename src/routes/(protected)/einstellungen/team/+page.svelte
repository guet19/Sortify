<script>
    import { enhance } from '$app/forms';
    import { jsPDF } from 'jspdf';

    export let data;
    export let form;

    const { members, currentUserRole } = data;

    // PDF-Export für die Zugangsdaten lokaler Accounts
    function downloadCredentialsPDF() {
        if (!form?.username || !form?.plainPassword) return;

        const doc = new jsPDF();

        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.setTextColor(34, 197, 94); // Sortify-Grün (#22c55e)
        doc.text("Sortify - System-Zugang", 20, 30);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(14);
        doc.setTextColor(51, 65, 85);
        doc.text("Ein neues lokales Benutzerkonto wurde für dich erstellt.", 20, 45);
        
        doc.setFontSize(12);
        doc.text("Bitte melde dich mit den folgenden Zugangsdaten an der App an.", 20, 55);
        doc.text("Wichtig: Du wirst beim ersten Login aufgefordert, dieses", 20, 62);
        doc.text("temporäre Passwort durch ein eigenes, sicheres Passwort zu ersetzen.", 20, 69);

        // Optische Box für Zugangsdaten
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
                                <option value="user" selected>Benutzer</option>
                                <option value="manager">Manager</option>
                                <option value="admin">Administrator</option>
                            </select>
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
                                <option value="user" selected>Benutzer</option>
                                <option value="manager">Manager</option>
                                <option value="admin">Administrator</option>
                            </select>
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
                        {#if currentUserRole === 'admin'}
                            <th class="text-right">Aktionen</th>
                        {/if}
                    </tr>
                </thead>
                <tbody>
                    {#each members as member}
                        <tr>
                            <td>
                                <div class="member-name-block">
                                    {#if member.firstName || member.lastName}
                                        <strong class="member-real-name">{member.firstName} {member.lastName}</strong>
                                        <span class="member-sub-info">{member.email || member.username}</span>
                                    {:else}
                                        <strong class="member-real-name">{member.username || member.email}</strong>
                                    {/if}
                                </div>
                            </td>
                            <td>
                                {#if member.email}
                                    <span class="type-badge cloud">E-Mail Account</span>
                                {:else}
                                    <span class="type-badge local">Lokaler Account</span>
                                {/if}
                            </td>
                            <td>
                                {#if currentUserRole === 'admin' && member.id !== data.currentUserId}
                                    <form method="POST" action="?/updateRole" use:enhance>
                                        <input type="hidden" name="targetUserId" value={member.id} />
                                        <select 
                                            name="newRole" 
                                            class="role-select" 
                                            on:change={(e) => {
                                                const label = member.username || 'diesem Mitglied';
                                                if (confirm(`Möchtest du die Rolle von "${label}" wirklich auf "${e.target.value}" ändern?`)) {
                                                    e.target.form.requestSubmit();
                                                } else {
                                                    window.location.reload(); // Setzt die Auswahl bei Abbruch zurück
                                                }
                                            }}
                                        >
                                            <option value="user" selected={member.role === 'user'}>Benutzer</option>
                                            <option value="manager" selected={member.role === 'manager'}>Manager</option>
                                            <option value="admin" selected={member.role === 'admin'}>Admin</option>
                                        </select>
                                    </form>
                                {:else}
                                    {#if member.role === 'admin'}
                                        <span class="badge badge-success">Admin</span>
                                    {:else}
                                        <span class="badge badge-secondary">{member.role}</span>
                                    {/if}
                                {/if}
                            </td>
                            <td>
                                {#if !member.isVerified}
                                    <span class="status-indicator pending">Einladung ausstehend</span>
                                {:else if member.mustChangePassword}
                                    <span class="status-indicator warning">PW-Wechsel ausstehend</span>
                                {:else}
                                    <span class="status-indicator active">Aktiv</span>
                                {/if}
                            </td>
                            
                            {#if currentUserRole === 'admin'}
                                <td class="text-right">
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

<style>
    /* Layout & Cards */
    .page-container { max-width: 1000px; margin: 0 auto; padding: 2rem 1rem; color: #334155; }
    h1 { color: #22c55e; margin: 0; }
    .h3-style { margin: 0; font-size: 1.25rem; color: #1e293b; }
    .profile-card { background: #ffffff; padding: 2rem; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    
    /* Grid für Admin-Aktionen */
    .admin-actions-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem; }
    @media (max-width: 768px) { .admin-actions-grid { grid-template-columns: 1fr; } }

    /* Utilities */
    .mb-3 { margin-bottom: 1.5rem; }
    .mb-4 { margin-bottom: 2rem; }
    .mt-2 { margin-top: 0.75rem; }
    .w-100 { width: 100%; }
    .text-right { text-align: right; }
    .text-muted { color: #64748b; font-size: 0.95rem; line-height: 1.5; }

    /* Formulare & Eingaben */
    .profile-form { display: flex; flex-direction: column; gap: 1.2rem; }
    .input-group { display: flex; flex-direction: column; gap: 0.4rem; }
    label { font-size: 0.85rem; font-weight: 600; color: #64748b; }
    input, select { padding: 0.7rem; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 1rem; background: #f8fafc; color: #334155; box-sizing: border-box; font-family: inherit; }
    input:focus, select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1); background: #ffffff; }
    select { cursor: pointer; }

    /* Inline-Dropdown für Tabellenrollen */
    .role-select { padding: 0.4rem; font-size: 0.85rem; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; color: #334155; cursor: pointer; width: 120px; }
    .role-select:focus { border-color: #3b82f6; outline: none; }

    /* Tabelle */
    .table-responsive { width: 100%; overflow-x: auto; }
    .team-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.95rem; }
    .team-table th { background: #f8fafc; padding: 1rem; color: #64748b; font-weight: 600; border-bottom: 2px solid #e2e8f0; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.5px; }
    .team-table td { padding: 1rem; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
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

    /* Action Buttons */
    .btn-primary { background: #3b82f6; color: white; padding: 0.7rem 1.5rem; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; transition: background 0.2s; font-family: inherit; display: inline-flex; justify-content: center; align-items: center; }
    .btn-primary:hover { background: #2563eb; }
    .btn-outline { background: white; color: #334155; border: 1px solid #cbd5e1; padding: 0.7rem 1.5rem; border-radius: 6px; font-weight: 600; cursor: pointer; transition: all 0.2s; font-family: inherit; }
    .btn-outline:hover { background: #f1f5f9; border-color: #94a3b8; }
    
    .btn-icon-danger { background: none; border: none; font-size: 1.2rem; cursor: pointer; opacity: 0.6; transition: all 0.2s; padding: 0.3rem; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; }
    .btn-icon-danger:hover { opacity: 1; background: #fee2e2; }
    
    /* Alerts */
    .alert { padding: 1rem; border-radius: 6px; margin-bottom: 1.5rem; font-weight: 500; }
    .success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .error { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
</style>