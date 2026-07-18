<script>
    import { onDestroy } from 'svelte';

    let isLive = false;
    let liveWeight = 0;
    let errorMessage = "";
    let pollingInterval = null;
    let isFetching = false;

    async function fetchWeight() {
        if (isFetching) return; 
        isFetching = true;
        errorMessage = "";

        try {
            const res = await fetch('/api/scale', { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                liveWeight = data.weight;
            } else {
                errorMessage = data.error;
                stopLiveMode();
            }
        } catch (err) {
            errorMessage = "Verbindungsabbruch zum Server.";
            stopLiveMode();
        } finally {
            isFetching = false;
        }
    }

    function toggleLiveMode() {
        if (isLive) {
            stopLiveMode();
        } else {
            isLive = true;
            fetchWeight();
            pollingInterval = setInterval(fetchWeight, 2000); 
        }
    }

    function stopLiveMode() {
        isLive = false;
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }

    onDestroy(() => {
        stopLiveMode();
    });
</script>

<div class="dashboard-wrapper">
    <div class="monitor-card">
        <!-- Header -->
        <div class="header">
            <div class="header-left">
                <div class="icon-container">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20.6 8.3a2 2 0 0 0-2.9 0l-5.3 5.3a2 2 0 0 1-2.8 0l-5.3-5.3a2 2 0 0 0-2.8 2.8l5.3 5.3a4 4 0 0 0 5.6 0l5.3-5.3a2 2 0 0 0 0-2.8Z"/>
                        <path d="M2 12h20"/>
                    </svg>
                </div>
                <h2 class="title">Waagen-Monitor</h2>
            </div>
            {#if isLive}
                <div class="live-badge">
                    <span class="pulse-dot"></span>
                    LIVE
                </div>
            {/if}
        </div>
        
        <!-- Error Message -->
        {#if errorMessage}
            <div class="error-box">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="error-icon"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {errorMessage}
            </div>
        {/if}

        <!-- Digital Display (nimmt den ganzen mittleren Platz ein) -->
        <div class="digital-display {isLive ? 'is-active' : ''}">
            <span class="display-label">Aktuelles Gewicht</span>
            <div class="weight-value">
                {liveWeight} <span class="unit">g</span>
            </div>
        </div>

        <!-- Controls (Unten angeheftet) -->
        <div class="controls">
            <button 
                on:click={toggleLiveMode}
                class="action-btn {isLive ? 'btn-stop' : 'btn-start'}"
            >
                {isLive ? 'Live-Messung stoppen' : 'Live-Messung starten'}
            </button>
            
            <div class="status-footer">
                {#if isLive}
                    <span class="loading-dots">Wartet auf Raspberry Pi<span>.</span><span>.</span><span>.</span></span>
                {:else}
                    System im Standby
                {/if}
            </div>
        </div>
    </div>
</div>

<style>
    /* Nimmt den Platz des übergeordneten Containers ein */
    .dashboard-wrapper {
        width: 100%;
        height: 100%;
        min-height: 70vh; /* Mindestens 70% der Bildschirmhöhe */
        display: flex;
        padding: 24px;
        box-sizing: border-box;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }

    /* Die Hauptkarte breitet sich komplett aus */
    .monitor-card {
        background: #ffffff;
        border-radius: 24px;
        box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.08);
        border: 1px solid #f1f5f9;
        padding: 40px;
        width: 100%;
        display: flex;
        flex-direction: column;
        flex-grow: 1;
    }

    /* Header */
    .header {
        display: flex;
        align-items: center;
        justify-content: space-between; /* Verteilt Titel und LIVE-Badge */
        margin-bottom: 32px;
    }

    .header-left {
        display: flex;
        align-items: center;
        gap: 16px;
    }

    /* FIX: Verhindert das Schrumpfen und Überlappen des Icons */
    .icon-container {
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f8fafc;
        width: 48px;     /* Feste Breite */
        height: 48px;    /* Feste Höhe */
        flex-shrink: 0;  /* Wichtig: Darf nicht vom Text gequetscht werden */
        border-radius: 12px;
        color: #3b82f6;
        border: 1px solid #e2e8f0;
    }

    .title {
        font-size: 1.75rem; /* Größerer Titel */
        font-weight: 800;
        color: #0f172a;
        margin: 0;
    }

    /* Live Badge */
    .live-badge {
        display: flex;
        align-items: center;
        gap: 8px;
        background: #fee2e2;
        color: #dc2626;
        padding: 8px 16px;
        border-radius: 9999px;
        font-size: 1rem;
        font-weight: 700;
        letter-spacing: 0.05em;
    }

    .pulse-dot {
        width: 10px;
        height: 10px;
        background-color: #ef4444;
        border-radius: 50%;
        animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: .3; }
    }

    /* Digital Display Box - Nimmt den ganzen Restplatz ein */
    .digital-display {
        background: #f8fafc;
        border: 2px solid #e2e8f0;
        border-radius: 20px;
        padding: 40px;
        flex-grow: 1; /* Lässt diese Box wachsen, bis sie den Bildschirm füllt */
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        margin-bottom: 32px;
        transition: all 0.3s ease;
        box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
    }

    .digital-display.is-active {
        background: #eff6ff;
        border-color: #bfdbfe;
        box-shadow: inset 0 2px 20px rgba(59, 130, 246, 0.08);
    }

    .display-label {
        font-size: 1.25rem;
        font-weight: 600;
        color: #64748b;
        margin-bottom: 16px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
    }

    .digital-display.is-active .display-label {
        color: #3b82f6;
    }

    /* Riesige Zahlen für Vollbild */
    .weight-value {
        font-size: 8rem; /* Massive Schriftgröße */
        font-weight: 800;
        color: #0f172a;
        line-height: 1;
        font-variant-numeric: tabular-nums;
    }

    .digital-display.is-active .weight-value {
        color: #1d4ed8;
    }

    .unit {
        font-size: 3rem;
        font-weight: 600;
        color: #94a3b8;
        margin-left: 8px;
    }

    .digital-display.is-active .unit {
        color: #60a5fa;
    }

    /* Error Box */
    .error-box {
        display: flex;
        align-items: center;
        gap: 12px;
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #b91c1c;
        padding: 16px 24px;
        border-radius: 16px;
        font-size: 1.125rem;
        font-weight: 500;
        margin-bottom: 24px;
    }

    .error-icon {
        flex-shrink: 0;
    }

    /* Controls (Button und Status) */
    .controls {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
    }

    /* Action Buttons */
    .action-btn {
        width: 100%;
        max-width: 600px; /* Begrenzt den Button, damit er nicht 2 Meter breit wird */
        padding: 24px;
        border-radius: 16px;
        font-size: 1.5rem;
        font-weight: 700;
        border: none;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .action-btn:active {
        transform: scale(0.98);
    }

    .btn-start {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        box-shadow: 0 8px 20px rgba(16, 185, 129, 0.25);
    }

    .btn-start:hover {
        background: linear-gradient(135deg, #059669 0%, #047857 100%);
        box-shadow: 0 10px 24px rgba(16, 185, 129, 0.35);
    }

    .btn-stop {
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: white;
        box-shadow: 0 8px 20px rgba(239, 68, 68, 0.25);
    }

    .btn-stop:hover {
        background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
        box-shadow: 0 10px 24px rgba(239, 68, 68, 0.35);
    }

    /* Footer Status */
    .status-footer {
        font-size: 1rem;
        color: #94a3b8;
        font-weight: 500;
        height: 24px; 
    }

    .loading-dots span {
        animation: blink 1.4s infinite both;
    }

    .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
    .loading-dots span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes blink {
        0% { opacity: 0.2; }
        20% { opacity: 1; }
        100% { opacity: 0.2; }
    }
</style>