<div class="dashboard-container">
    <h2>Hauptmenü</h2>
    
    <div class="action-grid">
        <!-- Karte 1: Artikel suchen -->
        <a href="/terminal/search" class="action-card search">
            <div class="icon">🔍</div>
            <h3>Artikel suchen</h3>
        </a>

        <!-- Karte 2: Retournieren / Einlagern -->
        <a href="/terminal/return" class="action-card return">
            <div class="icon">⚖️</div>
            <h3>Artikel retournieren</h3>
        </a>
    </div>
</div>

<style>
    .dashboard-container { max-width: 1000px; margin: 0 auto; padding-top: 4rem; }
    h2 { font-size: 2.5rem; margin-bottom: 3rem; font-weight: 300; color: #e2e8f0; text-align: center; }

    /* Grid für exakt 2 Spalten */
    .action-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 3rem;
    }

    .action-card {
        background-color: #1e293b;
        border: 2px solid #334155;
        border-radius: 20px;
        padding: 4rem 2rem;
        text-align: center;
        text-decoration: none;
        color: inherit;
        transition: all 0.2s ease-in-out;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.5rem;
    }

    /* Verschiedene Akzentfarben für schnelle visuelle Unterscheidung */
    .action-card.search:hover, .action-card.search:active { background-color: #334155; transform: translateY(-5px); border-color: #10b981; }
    .action-card.return:hover, .action-card.return:active { background-color: #334155; transform: translateY(-5px); border-color: #3b82f6; }

    .icon { font-size: 5rem; margin-bottom: 1rem; }
    h3 { margin: 0; font-size: 2rem; }
    p { margin: 0; color: #cbd5e1; font-size: 1.2rem; line-height: 1.5; max-width: 80%; }
</style>