<script>
    let hardwareConnected = true; 
</script>

<div class="terminal-viewport">
    <header class="terminal-header">
        <div class="branding">
            <!-- Das Logo fungiert gleichzeitig als Home-Button -->
            <a href="/terminal" class="home-link">
                <h1>Sortify <span class="badge">TERMINAL</span></h1>
            </a>
        </div>
        
        <div class="system-status">
            <div class="status-indicator">
                <span class="dot {hardwareConnected ? 'online' : 'offline'}"></span>
                <span class="status-text">{hardwareConnected ? 'Sync aktiv' : 'Offline'}</span>
            </div>
            
            <!-- NEU: Das kleine Zahnrad-Symbol oben rechts -->
            <a href="/terminal/settings" class="settings-btn" aria-label="Einstellungen">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
            </a>
        </div>
    </header>

    <main class="terminal-content">
        <slot />
    </main>
</div>

<style>
    /* ... (Bisherige Styles bleiben gleich, plus das hier:) ... */
    :global(body) { margin: 0; padding: 0; background-color: #0f172a; color: #f8fafc; font-family: system-ui, sans-serif; }
    .terminal-viewport { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
    .terminal-header { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem 2rem; background-color: #1e293b; border-bottom: 2px solid #334155; }
    
    .home-link { text-decoration: none; color: inherit; }
    .branding h1 { margin: 0; font-size: 1.8rem; display: flex; align-items: center; gap: 1rem; }
    .badge { font-size: 0.9rem; background-color: #3b82f6; padding: 0.3rem 0.8rem; border-radius: 8px; letter-spacing: 2px; }
    
    .system-status { display: flex; align-items: center; gap: 2rem; }
    .status-indicator { display: flex; align-items: center; gap: 0.8rem; font-weight: 600; color: #94a3b8; }
    .dot { width: 12px; height: 12px; border-radius: 50%; }
    .online { background-color: #22c55e; box-shadow: 0 0 10px #22c55e; }
    .offline { background-color: #ef4444; box-shadow: 0 0 10px #ef4444; }

    /* Touch-freundlicher Settings-Button */
    .settings-btn {
        background: transparent;
        color: #94a3b8;
        border: 1px solid #475569;
        border-radius: 12px;
        width: 54px;
        height: 54px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }
    .settings-btn:hover, .settings-btn:active { background-color: #334155; color: #fff; border-color: #3b82f6; }
    
    .terminal-content { flex: 1; padding: 2rem; overflow-y: auto; }
</style>