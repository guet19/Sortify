<script>
    import { page } from "$app/stores";

    // Zentrale Funktion: Prüft, ob der Menüpunkt gerendert werden darf
    function canSee(path) {
        if (!$page.data.role) return false;
        if ($page.data.role === 'admin') return true;

        const allowed = $page.data.allowedRoutes || [];
        if (allowed.includes('*')) return true;

        return allowed.some(r => {
            if (r === '/') return path === '/';
            return path.startsWith(r);
        });
    }
</script>

<div class="settings-container">
    <div class="header-area">
        <h2>Einstellungen & Setup</h2>
        <!-- Der Zurück-Button führt direkt zum Touch-Dashboard -->
        <a href="/terminal" class="back-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-arrow-left"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            Zurück zum Menü
        </a>
    </div>
    
    <div class="action-grid">
        
        {#if canSee('/terminal/settings/assign')}
            <!-- Karte 1: Artikel zuweisen -->
            <a href="/terminal/settings/assign" class="action-card">
                <div class="icon">🔗</div>
                <div class="card-content">
                    <h3>Artikel zuweisen</h3>
                    <p>Einen bestehenden Artikel mit einem physischen Fach verknüpfen.</p>
                </div>
            </a>
        {/if}

        {#if canSee('/terminal/settings/shelf')}
            <!-- Karte 2: Hardware Anlernen -->
            <a href="/terminal/settings/shelf" class="action-card">
                <div class="icon">💡</div>
                <div class="card-content">
                    <h3>Fächer anlernen</h3>
                    <p>Hardware-Setup, LED-Test und Kartierung der Werkstatt-Fächer.</p>
                </div>
            </a>
        {/if}

        {#if canSee('/terminal/settings/maintenance')}
            <!-- Karte 3: Inventarpflege -->
            <a href="/terminal/settings/maintenance" class="action-card">
                <div class="icon">💡</div>
                <div class="card-content">
                    <h3>Inventarpflege</h3>
                    <p>Aktualisierung der Bestände</p>
                </div>
            </a>
        {/if}

        <!-- Karte 4: Abmelden (Immer sichtbar) -->
        <!-- Nutzt deine bestehende /logout Route mit reload, um die Session sauber zu beenden -->
        <a href="/logout" data-sveltekit-reload class="action-card danger">
            <div class="icon">🔒</div>
            <div class="card-content">
                <h3>Abmelden</h3>
                <p>Sitzung auf diesem Terminal beenden und zum Login zurückkehren.</p>
            </div>
        </a>

    </div>
</div>

<style>
    .settings-container { 
        max-width: 1000px; 
        margin: 0 auto; 
        padding-top: 2rem; 
    }
    
    .header-area {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 3rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid #334155;
    }

    h2 { 
        font-size: 2.2rem; 
        margin: 0; 
        font-weight: 300; 
        color: #e2e8f0; 
    }

    .back-btn {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background-color: #334155;
        color: #f8fafc;
        padding: 0.8rem 1.5rem;
        border-radius: 12px;
        text-decoration: none;
        font-size: 1.1rem;
        font-weight: 500;
        border: 1px solid #475569;
        transition: all 0.2s ease;
    }
    .back-btn:hover { 
        background-color: #475569; 
        border-color: #64748b;
    }

    .action-grid {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .action-card {
        background-color: #1e293b;
        border: 2px solid #334155;
        border-radius: 16px;
        padding: 2rem;
        text-decoration: none;
        color: inherit;
        display: flex;
        align-items: center;
        gap: 2rem;
        transition: all 0.2s ease-in-out;
    }

    .action-card:hover { 
        background-color: #334155; 
        border-color: #64748b; 
        transform: translateX(10px);
    }

    .action-card.danger:hover { 
        border-color: #ef4444; 
        background-color: rgba(239, 68, 68, 0.1);
    }

    .icon { 
        font-size: 3rem; 
        background-color: #0f172a;
        width: 80px;
        height: 80px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 16px;
        flex-shrink: 0;
    }
    
    .card-content {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    h3 { 
        margin: 0; 
        font-size: 1.5rem; 
        color: #f1f5f9;
    }
    
    p { 
        margin: 0; 
        color: #94a3b8; 
        font-size: 1.1rem; 
        line-height: 1.5; 
    }
</style>