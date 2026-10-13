<script>
    import TerminalHeader from '$lib/components/TerminalHeader.svelte';
    import { page } from "$app/stores";
    import { canAccessPath } from "$lib/permissions.js";

    // Zentrale Funktion: Prüft, ob der Menüpunkt gerendert werden darf
    function canSee(path) {
        if (!$page.data.role) return false;
        if ($page.data.role === 'admin') return true;

        const allowed = $page.data.allowedRoutes || [];
        if (allowed.includes('*')) return true;

        return canAccessPath(path, allowed);
    }
</script>

<div class="settings-container">
    <TerminalHeader title="Einstellungen & Setup" backHref="/terminal" />

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

        {#if canSee('/terminal/settings/scale')}
            <!-- Karte 1: Artikel zuweisen -->
            <a href="/terminal/settings/scale" class="action-card">
                <div class="icon">⚖️</div>
                <div class="card-content">
                    <h3>Waage testen</h3>
                    <p>Die Waage mit Messungen überprüfen.</p>
                </div>
            </a>
        {/if}

        {#if canSee('/terminal/settings/calibration')}
            <!-- Karte 1: Artikel zuweisen -->
            <a href="/terminal/settings/calibration" class="action-card">
                <div class="icon">🎯</div>
                <div class="card-content">
                    <h3>Waage kalibrieren</h3>
            
                </div>
            </a>
        {/if}

        {#if canSee('/terminal/settings/shelf')}
            <!-- Karte 2: Hardware Anlernen -->
            <a href="/terminal/settings/shelf" class="action-card">
                <div class="icon">🗄️</div>
                <div class="card-content">
                    <h3>Fächer anlernen</h3>
                    <p>Hardware-Setup, LED-Test und Kartierung der Werkstatt-Fächer.</p>
                </div>
            </a>
        {/if}

        {#if canSee('/terminal/settings/pairing')}
            <!-- Karte 2: Hardware Anlernen -->
            <a href="/terminal/settings/pairing" class="action-card">
                <div class="icon">📡</div>
                <div class="card-content">
                    <h3>Terminal koppeln</h3>
                    <p>Terminal-Hardware mit dem System koppeln.</p>
                </div>
            </a>
        {/if}

        {#if canSee('/terminal/settings/maintenance')}
            <!-- Karte 3: Inventarpflege -->
            <a href="/terminal/settings/maintenance" class="action-card">
                <div class="icon">📋</div>
                <div class="card-content">
                    <h3>Inventarpflege</h3>
                    <p>Aktualisierung der Bestände</p>
                </div>
            </a>
        {/if}

        <!-- Karte 4: Abmelden (Immer sichtbar) -->
        <!-- Logout per POST (ein Link könnte von fremden Seiten ausgelöst werden) -->
        <form method="POST" action="/logout" class="logout-form">
            <button type="submit" class="action-card danger">
                <div class="icon">🔒</div>
                <div class="card-content">
                    <h3>Abmelden</h3>
                    <p>Sitzung auf diesem Terminal beenden und zum Login zurückkehren.</p>
                </div>
            </button>
        </form>

    </div>
</div>

<style>
    .settings-container { 
        max-width: 1000px; 
        margin: 0 auto; 
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

    /* Button soll exakt wie die Link-Karten aussehen */
    .logout-form { display: contents; }
    button.action-card { width: 100%; text-align: left; font: inherit; cursor: pointer; }

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

    /* ===== Smartphone ===== */
    @media (max-width: 640px) {
        .action-grid { gap: 0.75rem; }
        .action-card { padding: 1rem; gap: 1rem; border-radius: 14px; }
        .action-card:hover { transform: none; }
        .icon { width: 52px; height: 52px; font-size: 1.8rem; border-radius: 12px; }
        .icon :global(svg) { width: 26px; height: 26px; }
        h3 { font-size: 1.15rem; }
        p { font-size: 0.9rem; }
    }
</style>