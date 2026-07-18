<script>
    let currentStep = 1; // 1 = Tara, 2 = Gewicht, 3 = Fertig
    let knownWeight = 100;
    let isProcessing = false;
    let errorMessage = "";

    async function calibrateZero() {
        if (isProcessing) return;
        isProcessing = true;
        errorMessage = "";

        try {
            const res = await fetch('/api/scale/calibrate', {
                method: 'POST',
                body: JSON.stringify({ step: 'zero' }),
                headers: { 'Content-Type': 'application/json' }
            });
            
            const data = await res.json();
            if (data.success) {
                currentStep = 2; // Gehe zu Schritt 2
            } else {
                errorMessage = data.error;
            }
        } catch (e) {
            errorMessage = "Serverfehler beim Nullpunkt-Setzen.";
        } finally {
            isProcessing = false;
        }
    }

    async function calibrateRatio() {
        if (isProcessing || knownWeight <= 0) return;
        isProcessing = true;
        errorMessage = "";

        try {
            const res = await fetch('/api/scale/calibrate', {
                method: 'POST',
                body: JSON.stringify({ step: 'ratio', weight: knownWeight }),
                headers: { 'Content-Type': 'application/json' }
            });
            
            const data = await res.json();
            if (data.success) {
                currentStep = 3; // Gehe zu Schritt 3
            } else {
                errorMessage = data.error;
            }
        } catch (e) {
            errorMessage = "Serverfehler bei der Gewichtsmessung.";
        } finally {
            isProcessing = false;
        }
    }

    function resetWizard() {
        currentStep = 1;
        errorMessage = "";
    }
</script>

<div class="dashboard-wrapper">
    <div class="wizard-card">
        
        <div class="header">
            <div class="header-left">
                <div class="icon-container">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>
                    </svg>
                </div>
                <h2 class="title">Waage kalibrieren</h2>
            </div>
            <div class="step-indicator">
                Schritt {currentStep} von 3
            </div>
        </div>

        {#if errorMessage}
            <div class="error-box">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="error-icon"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {errorMessage}
            </div>
        {/if}

        <div class="step-content">
            <!-- SCHRITT 1: TARA -->
            {#if currentStep === 1}
                <div class="instruction">
                    <h3 class="step-title">1. Nullpunkt ermitteln</h3>
                    <p class="step-desc">Bitte räume die Waage komplett leer und stelle sicher, dass sie nicht wackelt.</p>
                </div>
                <button on:click={calibrateZero} class="action-btn btn-primary" disabled={isProcessing}>
                    {isProcessing ? 'Messe Nullpunkt...' : 'Nullpunkt (Tara) festlegen'}
                </button>
            {/if}

            <!-- SCHRITT 2: GEWICHT -->
            {#if currentStep === 2}
                <div class="instruction">
                    <h3 class="step-title">2. Referenzgewicht auflegen</h3>
                    <p class="step-desc">Lege nun einen Gegenstand mit einem exakt bekannten Gewicht (z.B. eine 100g Hantel) mittig auf die Waage.</p>
                </div>
                
                <div class="input-group">
                    <label for="weightInput">Exaktes Gewicht des Gegenstands:</label>
                    <div class="input-wrapper">
                        <input id="weightInput" type="number" bind:value={knownWeight} min="0.01" disabled={isProcessing} class="weight-input" />
                        <span class="input-unit">g</span>
                    </div>
                </div>

                <div class="btn-group">
                    <button on:click={resetWizard} class="action-btn btn-secondary" disabled={isProcessing}>Abbrechen</button>
                    <button on:click={calibrateRatio} class="action-btn btn-primary" disabled={isProcessing || knownWeight <= 0}>
                        {isProcessing ? 'Kalibriere...' : 'Waage kalibrieren'}
                    </button>
                </div>
            {/if}

            <!-- SCHRITT 3: ERFOLG -->
            {#if currentStep === 3}
                <div class="success-content">
                    <div class="success-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    </div>
                    <h3 class="step-title">Erfolgreich kalibriert!</h3>
                    <p class="step-desc">Die Waage wurde eingerichtet und das Profil auf dem Raspberry Pi gespeichert.</p>
                </div>
                <!-- Hier könntest du z.B. einen SvelteKit Link einbauen, um zurück zum Dashboard zu navigieren -->
                <button on:click={resetWizard} class="action-btn btn-primary">Neue Kalibrierung starten</button>
            {/if}
        </div>
    </div>
</div>

<style>
    .dashboard-wrapper {
        width: 100%;
        height: 100%;
        min-height: 70vh;
        display: flex;
        padding: 24px;
        box-sizing: border-box;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }

    .wizard-card {
        background: #ffffff;
        border-radius: 24px;
        box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.08);
        border: 1px solid #f1f5f9;
        padding: 40px;
        width: 100%;
        max-width: 700px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
    }

    .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 32px;
        padding-bottom: 24px;
        border-bottom: 2px solid #f1f5f9;
    }

    .header-left {
        display: flex;
        align-items: center;
        gap: 16px;
    }

    .icon-container {
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f8fafc;
        width: 48px;
        height: 48px;
        flex-shrink: 0;
        border-radius: 12px;
        color: #3b82f6;
        border: 1px solid #e2e8f0;
    }

    .title {
        font-size: 1.75rem;
        font-weight: 800;
        color: #0f172a;
        margin: 0;
    }

    .step-indicator {
        font-size: 1rem;
        font-weight: 700;
        color: #64748b;
        background: #f1f5f9;
        padding: 8px 16px;
        border-radius: 999px;
    }

    .step-content {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
    }

    .instruction {
        text-align: center;
        margin-bottom: 40px;
    }

    .step-title {
        font-size: 1.5rem;
        font-weight: 700;
        color: #0f172a;
        margin-bottom: 12px;
    }

    .step-desc {
        font-size: 1.125rem;
        color: #64748b;
        line-height: 1.6;
    }

    .input-group {
        background: #f8fafc;
        border: 2px solid #e2e8f0;
        border-radius: 16px;
        padding: 32px;
        text-align: center;
        margin-bottom: 32px;
    }

    .input-group label {
        display: block;
        font-size: 1rem;
        font-weight: 600;
        color: #64748b;
        margin-bottom: 16px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .input-wrapper {
        display: flex;
        align-items: baseline;
        justify-content: center;
    }

    .weight-input {
        font-size: 2rem;
        font-weight: 800;
        color: #0f172a;
        background: transparent;
        border: none;
        width: 200px;
        text-align: right;
        outline: none;
        border-bottom: 4px solid #bfdbfe;
        padding-bottom: 8px;
        font-variant-numeric: tabular-nums;
    }

    .weight-input:focus {
        border-bottom-color: #3b82f6;
    }

    .input-unit {
        font-size: 2rem;
        font-weight: 700;
        color: #94a3b8;
        margin-left: 12px;
    }

    .btn-group {
        display: flex;
        gap: 16px;
    }

    .action-btn {
        flex: 1;
        padding: 20px;
        border-radius: 12px;
        font-size: 1.25rem;
        font-weight: 700;
        border: none;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .action-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none !important;
    }

    .action-btn:active:not(:disabled) {
        transform: scale(0.98);
    }

    .btn-primary {
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        color: white;
        box-shadow: 0 8px 20px rgba(59, 130, 246, 0.25);
    }

    .btn-primary:hover:not(:disabled) {
        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
        box-shadow: 0 10px 24px rgba(59, 130, 246, 0.35);
    }

    .btn-secondary {
        background: #f1f5f9;
        color: #475569;
    }

    .btn-secondary:hover:not(:disabled) {
        background: #e2e8f0;
    }

    .error-box {
        display: flex;
        align-items: center;
        gap: 12px;
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #b91c1c;
        padding: 16px 24px;
        border-radius: 12px;
        font-size: 1rem;
        font-weight: 500;
        margin-bottom: 24px;
    }

    .success-content {
        text-align: center;
        margin-bottom: 40px;
    }

    .success-icon {
        color: #22c55e;
        display: flex;
        justify-content: center;
        margin-bottom: 24px;
    }
</style>