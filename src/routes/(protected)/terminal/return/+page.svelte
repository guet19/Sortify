<script>
    import { enhance } from '$app/forms';
    import { onDestroy } from 'svelte';

    export let form; 
    
    let scanInput = '';
    let scanInputRef;

    let currentStep = 'scan'; 
    let article = null;
    let requestId = null;
    let pollInterval = null;
    let isScanning = false;
    
    let measuredWeight = 0;
    let calculatedStock = 0;
    let stockDifference = 0;
    let currentBoxWeight = 0; 

    // GEÄNDERT: Hört nun auf den Status 'instruction' vom Scan
    $: if (form?.success && form?.step === 'instruction') {
        article = form.article;
        currentBoxWeight = form.boxWeight || 0; 
        currentStep = 'instruction';
    }

    $: if (form?.success && form?.step === 'done') {
        currentStep = 'success';
        setTimeout(() => resetWorkflow(), 5000);
    }

    function startPolling() {
        if (pollInterval) clearInterval(pollInterval);
        
        pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/scale/${requestId}`);
                const data = await res.json();

                if (data.status === 'done' && data.weight !== null) {
                    clearInterval(pollInterval);
                    processWeightResult(data.weight);
                }
            } catch (err) {
                console.error("Fehler beim Polling", err);
            }
        }, 500); 
    }

    function processWeightResult(weightInGrams) {
        measuredWeight = weightInGrams;
        
        const boxWeight = parseFloat(currentBoxWeight) || 0; 
        const itemWeight = parseFloat(article.attributes?.itemWeight) || 1; 

        const netWeight = Math.max(0, measuredWeight - boxWeight);
        calculatedStock = Math.round(netWeight / itemWeight);
        
        const currentStock = article.istBestand || 0;
        stockDifference = calculatedStock - currentStock;

        currentStep = 'confirm';
    }

    function resetWorkflow() {
        if (pollInterval) clearInterval(pollInterval);
        currentStep = 'scan';
        article = null;
        requestId = null;
        form = null;
        scanInput = '';
        currentBoxWeight = 0;
        setTimeout(() => scanInputRef?.focus(), 100);
    }

    function focusOnInit(node) {
        node.focus();
        return { destroy() {} };
    }

    onDestroy(() => {
        if (pollInterval) clearInterval(pollInterval);
    });
</script>

<div class="terminal-page space-grotesk">
    <div class="header">
        <h1>Artikel Retournieren</h1>
        <button class="btn-back" on:click={resetWorkflow}>
            Zurücksetzen
        </button>
    </div>

    <div class="workflow-container">
        
        {#if currentStep === 'scan'}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="card scan-card" on:click={() => scanInputRef?.focus()}>
                <div class="icon-pulse" style="color: {isScanning ? '#3b82f6' : '#f8fafc'};">
                    {isScanning ? '⏳' : '📠'}
                </div>
                <h2>{isScanning ? 'Suche Artikel...' : 'Artikel abscannen'}</h2>
                <p>Scanne den Barcode der Box, die du retournieren möchtest.</p>
                
                {#if form?.error === 'unknown_barcode'}
                    <div class="error-box">Dieser Barcode ist keinem Artikel zugewiesen!</div>
                {:else if form?.error === 'missing_weights'}
                    <div class="error-box">
                        Dem Artikel fehlen die Gewichts-Stammdaten (Tara/Einzelgewicht).<br>
                        Messen nicht möglich. Bitte über das Einstellungs-Menü erst zuweisen.
                    </div>
                {/if}

                <form method="POST" action="?/scanForReturn" use:enhance={() => {
                    isScanning = true;
                    return async ({ update }) => {
                        await update();
                        isScanning = false;
                        if (currentStep === 'scan') {
                            scanInput = '';
                            setTimeout(() => scanInputRef?.focus(), 100);
                        }
                    };
                }}>
                    <input 
                        bind:this={scanInputRef}
                        bind:value={scanInput}
                        type="text" 
                        name="barcode"
                        class="hidden-scan-input"
                        required
                        use:focusOnInit
                    >
                    <button type="submit" style="display: none;">Senden</button>
                </form>
            </div>

        <!-- SCHRITT 2: ANWEISUNG -->
        {:else if currentStep === 'instruction'}
            <div class="card instruction-card">
                <div class="article-info" style="margin-bottom: 2rem;">
                    <h3 style="color: #38bdf8;">{article.title}</h3>
                    <p>Aktueller Bestand: <strong>{article.istBestand || 0} Stück</strong></p>
                </div>

                <div style="font-size: 5rem; margin-bottom: 1rem;">⚖️</div>
                <h2 style="color: #f59e0b;">Box auf die Waage stellen</h2>
                <p style="color: #cbd5e1; font-size: 1.1rem; line-height: 1.5; margin-bottom: 2rem;">
                    Bitte lege nun das <strong>komplette Fach inkl. aller Schrauben</strong> (auch denen, die du retournieren möchtest) mittig auf die Waage.
                </p>

                <!-- NEU: Dieser Button triggert jetzt die Verzögerung & Messung -->
                <form method="POST" action="?/requestScale" use:enhance={() => {
                    currentStep = 'weighing'; // Schaltet UI sofort auf "Lade-Spinner" um
                    return async ({ result }) => {
                        if (result.data?.success) {
                            requestId = result.data.requestId;
                            startPolling();
                        }
                    };
                }}>
                    <input type="hidden" name="barcode" value={article.assigned_barcode}>
                    <button type="submit" class="btn-primary huge-btn" style="background: #f59e0b;">
                        Box liegt auf der Waage – Messung starten
                    </button>
                </form>
            </div>

        <!-- SCHRITT 3: WARTEN AUF DIE WAAGE -->
        {:else if currentStep === 'weighing'}
            <div class="card weighing-card">
                <div class="article-info">
                    <h3>{article.title}</h3>
                    <p>Aktueller Bestand im System: <strong>{article.istBestand || 0} Stück</strong></p>
                </div>

                <div class="scale-animation">
                    <div class="spinner"></div>
                    <h2>Messe Gewicht... (Waage beruhigt sich)</h2>
                    <p>Bitte die Box auf der Waage nicht berühren.</p>
                </div>
            </div>

        <!-- SCHRITT 4: BESTÄTIGEN -->
        {:else if currentStep === 'confirm'}
            <div class="card confirm-card">
                <h2>Messergebnis</h2>
                
                <div class="stats-grid">
                    <div class="stat-box">
                        <span class="label">Gesamtgewicht</span>
                        <span class="value">{measuredWeight}g</span>
                    </div>
                    <div class="stat-box">
                        <span class="label">Netto (ohne Box)</span>
                        <span class="value">{Math.max(0, measuredWeight - currentBoxWeight).toFixed(1)}g</span>
                    </div>
                </div>

                <div class="result-highlight">
                    <div class="old-stock">Alt: {article.istBestand || 0}</div>
                    <div class="arrow">➔</div>
                    <div class="new-stock">Neu: {calculatedStock} Stk.</div>
                </div>

                <div class="difference" class:positive={stockDifference > 0} class:negative={stockDifference < 0}>
                    {#if stockDifference > 0}
                        +{stockDifference} Stück hinzugefügt
                    {:else if stockDifference < 0}
                        {stockDifference} Stück entnommen (Differenz)
                    {:else}
                        Bestand unverändert
                    {/if}
                </div>

                <form method="POST" action="?/bookReturn" use:enhance>
                    <input type="hidden" name="articleId" value={article._id}>
                    <input type="hidden" name="barcode" value={article.assigned_barcode}>
                    <input type="hidden" name="newStock" value={calculatedStock}>
                    
                    <button type="submit" class="btn-primary huge-btn">
                        Veränderung buchen & Fach leuchten lassen
                    </button>
                </form>
            </div>

        <!-- SCHRITT 5: ERFOLG -->
        {:else if currentStep === 'success'}
            <div class="card success-card">
                <div class="icon-pulse" style="color: #22c55e;">✅</div>
                <h2 style="color: #22c55e;">Erfolgreich gebucht!</h2>
                <p>Das Fach im Regal leuchtet nun für 10 Sekunden auf.<br>Bitte räume die Box ein.</p>
                <p style="color: #94a3b8; font-size: 0.9rem; margin-top: 1rem;">Nächster Scan in Kürze möglich...</p>
            </div>
        {/if}
    </div>
</div>

<style>
    /* ... EXAKT DEINE BISHERIGEN STYLES BLEIBEN HIER UNVERÄNDERT ... */
    .terminal-page { max-width: 800px; margin: 0 auto; padding: 2rem; color: #f8fafc; text-align: center; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 3rem; }
    h1 { color: #22c55e; margin: 0; }
    .btn-back { background: transparent; border: 1px solid #475569; color: #94a3b8; padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer; }
    .card { background: #1e293b; border: 2px solid #334155; border-radius: 16px; padding: 3rem; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .scan-card { cursor: pointer; }
    .icon-pulse { font-size: 5rem; margin-bottom: 1rem; animation: pulse 2s infinite; transition: color 0.3s; }
    .hidden-scan-input { opacity: 0; position: absolute; height: 1px; width: 1px; z-index: -1; }
    .error-box { background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; color: #ef4444; padding: 1rem; border-radius: 8px; margin-top: 1.5rem; font-weight: bold; }
    .scale-animation { margin-top: 3rem; padding: 2rem; background: rgba(59, 130, 246, 0.1); border-radius: 12px; border: 1px dashed #3b82f6; }
    .spinner { width: 50px; height: 50px; border: 5px solid #334155; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1.5rem auto; }
    .stats-grid { display: flex; justify-content: center; gap: 2rem; margin-bottom: 2rem; }
    .stat-box { display: flex; flex-direction: column; background: #0f172a; padding: 1rem; border-radius: 8px; border: 1px solid #334155; min-width: 150px; }
    .stat-box .label { color: #94a3b8; font-size: 0.9rem; text-transform: uppercase; }
    .stat-box .value { font-size: 1.5rem; font-weight: bold; color: #38bdf8; }
    .result-highlight { display: flex; align-items: center; justify-content: center; gap: 2rem; background: #0f172a; padding: 2rem; border-radius: 12px; font-size: 2rem; font-weight: bold; margin-bottom: 1rem; }
    .old-stock { color: #94a3b8; }
    .arrow { color: #475569; }
    .new-stock { color: #f8fafc; }
    .difference { font-size: 1.2rem; font-weight: bold; margin-bottom: 3rem; color: #94a3b8; }
    .difference.positive { color: #22c55e; }
    .difference.negative { color: #ef4444; }
    .huge-btn { width: 100%; background: #3b82f6; color: white; border: none; padding: 1.5rem; border-radius: 12px; font-size: 1.3rem; font-weight: bold; cursor: pointer; transition: background 0.2s; }
    .huge-btn:hover { filter: brightness(1.1); }
    @keyframes pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(0.95); } 100% { opacity: 1; transform: scale(1); } }
    @keyframes spin { to { transform: rotate(360deg); } }
</style>