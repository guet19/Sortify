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
    let lastScannedCode = ''; 
    
    let measuredWeight = 0;
    let currentBoxWeight = 0; 
    let activeBarcode = '';

    $: displaySlots = (() => {
        let slots = [];
        if (Array.isArray(article?.assigned_barcodes) && article?.assigned_barcodes.length > 0) {
            slots = article.assigned_barcodes.map(b => typeof b === 'object' ? b.barcode : b);
        } else if (article?.assigned_barcode) {
            slots = [article.assigned_barcode];
        }
        return slots;
    })();

    $: if (form?.success && form?.step === 'instruction') {
        article = form.article;
        currentBoxWeight = form.boxWeight || 0; 
        currentStep = 'instruction';
    }

    $: if (form?.success && form?.step === 'done') {
        currentStep = form?.unlinked ? 'success_unlinked' : 'success';
        setTimeout(() => resetWorkflow(), 15000);
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
        currentStep = 'confirm';
    }

    $: oldDrawerStock = (() => {
        if (!article || !activeBarcode) return 0;
        let foundStock = 0;
        let isMigrated = false;

        if (Array.isArray(article.assigned_barcodes)) {
            const drawer = article.assigned_barcodes.find(b => 
                (typeof b === 'object' && b.barcode === activeBarcode) || 
                (typeof b === 'string' && b === activeBarcode)
            );
            if (drawer) {
                if (typeof drawer === 'object') {
                    foundStock = parseFloat(drawer.stock) || 0;
                    isMigrated = true;
                } else if (article.assigned_barcode === activeBarcode) {
                    foundStock = parseFloat(article?.istBestand) || 0;
                }
            }
        } 
        if (!isMigrated && article?.assigned_barcode === activeBarcode) {
            foundStock = parseFloat(article?.istBestand) || 0;
        }
        return foundStock;
    })();

    $: newDrawerStock = (() => {
        if (!article) return 0;
        const boxWeight = parseFloat(currentBoxWeight) || 0; 
        const itemWeight = parseFloat(article?.attributes?.itemWeight) || 1; 
        const netWeight = Math.max(0, measuredWeight - boxWeight);
        return Math.round(netWeight / itemWeight);
    })();

    $: difference = newDrawerStock - oldDrawerStock;
    $: newTotalStock = (parseFloat(article?.istBestand) || 0) + difference;

    function resetWorkflow() {
        if (pollInterval) clearInterval(pollInterval);
        currentStep = 'scan';
        article = null;
        requestId = null;
        form = null;
        scanInput = '';
        activeBarcode = '';
        currentBoxWeight = 0;
        lastScannedCode = ''; 
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
        <button class="btn-back" on:click={resetWorkflow}>Zurücksetzen</button>
    </div>

    <div class="workflow-container">
        
        {#if currentStep === 'scan'}
            <div class="card scan-card" on:click={() => scanInputRef?.focus()}>
                
                <div class="emoji-hero">📥</div>
                <h2 class="step-title">Artikel abscannen</h2>
                <p class="step-desc">Scanne den Barcode der Box, die du retournieren möchtest.</p>
                
                {#if form?.error === 'unknown_barcode'}
                    <div class="error-box">Dieser Barcode ist keinem Artikel zugewiesen!</div>
                {:else if form?.error === 'missing_weights'}
                    <div class="error-box">Dem Artikel fehlen die Gewichts-Stammdaten.</div>
                {/if}

                <form method="POST" action="?/scanForReturn" use:enhance={({ formData }) => {
                    isScanning = true;
                    const submittedBarcode = formData.get('barcode');
                    lastScannedCode = submittedBarcode; 

                    return async ({ update, result }) => {
                        await update();
                        isScanning = false;
                        if (result.data?.success) {
                            activeBarcode = submittedBarcode;
                        } else if (currentStep === 'scan') {
                            scanInput = '';
                            activeBarcode = '';
                            setTimeout(() => scanInputRef?.focus(), 100);
                        }
                    };
                }}>
                    <div class="scan-animation-wrapper">
                        <div class="scan-line"></div>
                        <span style="color: {isScanning ? '#22c55e' : '#60a5fa'};">
                            {#if isScanning && lastScannedCode}
                                ⏳ Prüfe: {lastScannedCode}...
                            {:else}
                                Warte auf Scanner-Eingabe...
                            {/if}
                        </span>
                    </div>

                    <input 
                        bind:this={scanInputRef} 
                        bind:value={scanInput} 
                        type="text" 
                        name="barcode" 
                        class="hidden-scan-input" 
                        use:focusOnInit
                        on:keydown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                if (scanInputRef.value.trim() !== '') {
                                    scanInput = scanInputRef.value.trim();
                                    e.target.form.requestSubmit();
                                }
                            }
                        }}
                    >
                    <button type="submit" style="display: none;">Senden</button>
                </form>
            </div>

        {:else if currentStep === 'instruction'}
            <div class="card instruction-card">
                
                <div class="article-profile-panel">
                    <h3 class="article-title">{article?.title}</h3>
                    
                    <div class="image-showcase">
                        {#if article?.imagePath}
                            <img src={article.imagePath} alt={article.title} />
                        {:else}
                            <div class="no-image-mini">
                                <span style="font-size: 2rem;">📷</span>
                                Kein Bild
                            </div>
                        {/if}
                    </div>
                    
                    <div class="stock-info"
                        class:low-stock={(article?.istBestand || 0) === 0 || (article?.mindestBestand != null && (article?.istBestand || 0) <= article?.mindestBestand)}
                        class:high-stock={(article?.istBestand || 0) > 0 && (article?.mindestBestand == null || (article?.istBestand || 0) > article?.mindestBestand)}>
                        <span class="indicator"></span>
                        Aktueller Gesamtbestand: {article?.istBestand || 0} Stück
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <form method="POST" action="?/requestScale" use:enhance={() => {
                        currentStep = 'weighing'; 
                        return async ({ result }) => {
                            if (result.data?.success) { requestId = result.data.requestId; startPolling(); }
                        };
                    }}>
                        <input type="hidden" name="barcode" value={activeBarcode}>
                        <button type="submit" class="huge-btn" style="background: #f59e0b;">
                            Box liegt auf der Waage – automatische Bestandesmessung starten
                        </button>
                    </form>

                    <form method="POST" action="?/returnWithoutWeighing" use:enhance={() => {
                        isScanning = true;
                        return async ({ update }) => { await update(); isScanning = false; };
                    }}>
                        <input type="hidden" name="articleId" value={article?._id}>
                        <input type="hidden" name="barcode" value={activeBarcode}>
                        <button type="submit" class="huge-btn" style="background: #334155; border: 1px dashed #475569; color: #cbd5e1; font-size: 1.1rem; padding: 1.2rem;">
                            Aktualisierung überspringen & direkt einlagern 
                        </button>
                    </form>
                </div>
            </div>

        {:else if currentStep === 'weighing'}
            <div class="card weighing-card">
                
                <div class="article-profile-panel-mini">
                    <div class="image-showcase-mini">
                        {#if article?.imagePath}
                            <img src={article.imagePath} alt={article.title} />
                        {:else}
                            <span style="font-size: 1.5rem; color: #94a3b8;">📷</span>
                        {/if}
                    </div>
                    <h3 class="article-title-mini">{article?.title}</h3>
                </div>

                <div class="scale-animation">
                    <div class="spinner"></div>
                    <h2>Messe Gewicht...</h2>
                    <p>Bitte die Box nicht berühren.</p>
                </div>
            </div>

        {:else if currentStep === 'confirm'}
            <div class="card confirm-card">
                <h2>Messergebnis</h2>
                
                <div class="stats-grid">
                    <div class="stat-box"><span class="label">Gesamtgewicht</span><span class="value">{measuredWeight.toFixed(2)}g</span></div>
                    <div class="stat-box"><span class="label">Netto (ohne Box)</span><span class="value">{Math.max(0, measuredWeight - currentBoxWeight).toFixed(2)}g</span></div>
                </div>

                <div class="calculation-box" style="background: #0f172a; padding: 2rem; border-radius: 12px; margin-top: 1.5rem;">
                    <div style="color: #94a3b8; font-size: 0.9rem; text-transform: uppercase; font-weight: bold; margin-bottom: 0.5rem;">Bestand in diesem Fach</div>
                    <h3 style="font-size: 2rem; margin: 0; color: white;">Alt: {oldDrawerStock} ➔ Neu: {newDrawerStock} Stk.</h3>
                    <div style="margin: 1.5rem 0; font-size: 1.2rem; font-weight: bold;">
                        {#if difference > 0}<span style="color: #22c55e;">+{difference} Stück hinzugefügt</span>
                        {:else if difference < 0}<span style="color: #ef4444;">{difference} Stück entnommen</span>
                        {:else}<span style="color: #94a3b8;">Keine Veränderung</span>{/if}
                    </div>
                    <hr style="border-color: #334155; margin: 1.5rem 0;" />
                    <div style="color: #94a3b8; font-size: 0.9rem; text-transform: uppercase; font-weight: bold; margin-bottom: 0.5rem;">Gesamter Artikelbestand</div>
                    <h4 style="font-size: 1.5rem; margin: 0; color: #38bdf8;">Alt: {article?.istBestand || 0} ➔ Neu: {newTotalStock} Stk.</h4>
                </div>

                {#if newDrawerStock === 0 && displaySlots.length > 1}
                    <div style="background: rgba(239, 68, 68, 0.05); border: 1px dashed #ef4444; border-radius: 12px; padding: 1.5rem; margin-top: 2rem; text-align: left;">
                        <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem;">
                            <span style="font-size: 2rem;">🗑️</span>
                            <div>
                                <h4 style="color: #ef4444; margin: 0 0 0.2rem 0; font-size: 1.1rem;">Fach ist komplett leer!</h4>
                                <p style="color: #cbd5e1; margin: 0; font-size: 0.95rem;">Der Artikel liegt auch noch in anderen Fächern. Möchtest du dieses Fach freigeben?</p>
                            </div>
                        </div>
                        
                        <div style="display: flex; gap: 1rem;">
                            <form method="POST" action="?/bookReturn" use:enhance style="flex: 1;">
                                <input type="hidden" name="articleId" value={article?._id}>
                                <input type="hidden" name="barcode" value={activeBarcode}>
                                <input type="hidden" name="newStock" value={0}>
                                <button type="submit" class="huge-btn" style="background: #334155; border: 1px solid #475569; color: #f8fafc; font-size: 1rem; padding: 1.2rem;">
                                    Nur buchen (Behalten)
                                </button>
                            </form>

                            <form method="POST" action="?/bookAndUnlink" use:enhance style="flex: 1.5;">
                                <input type="hidden" name="articleId" value={article?._id}>
                                <input type="hidden" name="barcode" value={activeBarcode}>
                                <button type="submit" class="huge-btn" style="background: #ef4444; font-size: 1rem; padding: 1.2rem;">
                                    Bestand buchen & Fach freigeben
                                </button>
                            </form>
                        </div>
                    </div>
                {:else}
                    <form method="POST" action="?/bookReturn" use:enhance style="margin-top: 2rem;">
                        <input type="hidden" name="articleId" value={article?._id}><input type="hidden" name="barcode" value={activeBarcode}><input type="hidden" name="newStock" value={newDrawerStock}>
                        <button type="submit" class="huge-btn">Veränderung buchen & Fach leuchten lassen</button>
                    </form>
                {/if}
            </div>

        {:else if currentStep === 'success'}
            <div class="card success-card">
                <form method="POST" action="?/triggerLedOnly" use:enhance={() => { return async () => {}; }} class="retrigger-form">
                    <input type="hidden" name="barcode" value={activeBarcode}>
                    <button type="submit" class="btn-retrigger-led">💡 Erneut leuchten</button>
                </form>

                <div class="emoji-hero" style="animation: bounce 2s infinite;">✅</div>
                <h2 style="color: #22c55e;">Erfolgreich eingespielt!</h2>
                <p>Das entsprechende Fach im Regal leuchtet nun auf.<br>Bitte räume die Box ein.</p>
            </div>

        {:else if currentStep === 'success_unlinked'}
            <div class="card success-card" style="border-color: #ef4444;">
                <form method="POST" action="?/triggerLedOnly" use:enhance={() => { return async () => {}; }} class="retrigger-form">
                    <input type="hidden" name="barcode" value={activeBarcode}>
                    <button type="submit" class="btn-retrigger-led">💡 Erneut leuchten</button>
                </form>

                <div class="emoji-hero" style="animation: bounce 2s infinite;">🗑️</div>
                <h2 style="color: #ef4444;">Fach freigegeben!</h2>
                <p>Der Bestand wurde auf 0 gesetzt und das Fach <strong>{activeBarcode}</strong> vom Artikel gelöst.<br>Das Fach leuchtet im Regal, damit du die leere Box <strong>wieder zurückstellen</strong> kannst.</p>
            </div>
        {/if}
    </div>
</div>

<style>
    .terminal-page { max-width: 800px; margin: 0 auto; padding: 2rem; color: #f8fafc; text-align: center; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 3rem; }
    h1 { color: #22c55e; margin: 0; }
    .btn-back { background: transparent; border: 1px solid #475569; color: #94a3b8; padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer; }
    
    .card { 
        background: #1e293b; border: 2px solid #334155; border-radius: 16px; padding: 3rem; 
        box-shadow: 0 10px 30px rgba(0,0,0,0.5); 
        position: relative; 
    }
    
    /* 🔥 NEUE STYLES FÜR DEN SETUP-WIZARD LOOK AUF DER RETURN SEITE */
    .emoji-hero { font-size: 4.5rem; margin-bottom: 1rem; line-height: 1; filter: drop-shadow(0 10px 10px rgba(0,0,0,0.2)); }
    .step-title { margin: 0 0 0.5rem 0; font-size: 2rem; color: #38bdf8; letter-spacing: -0.02em; }
    .step-desc { color: #94a3b8; font-size: 1.1rem; margin-bottom: 2rem; line-height: 1.5; }
    
    .scan-animation-wrapper { 
        background: #0f172a; 
        border: 2px dashed #3b82f6; 
        border-radius: 12px; 
        padding: 2rem; 
        display: flex; 
        flex-direction: column; 
        align-items: center; 
        gap: 1rem; 
        cursor: pointer; 
        position: relative; 
        overflow: hidden; 
        transition: all 0.2s; 
    }
    .scan-animation-wrapper:hover { background: rgba(59, 130, 246, 0.05); border-style: solid; }
    .scan-animation-wrapper span { font-weight: 600; font-family: monospace; letter-spacing: 0.05em; font-size: 1.1rem; }
    .scan-line { width: 80%; height: 2px; background: #3b82f6; box-shadow: 0 0 10px #3b82f6; animation: scan 2s linear infinite; position: absolute; top: 0; }
    @keyframes scan { 0% { top: 0; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { top: 100%; opacity: 0; } }

    .article-profile-panel {
        background: #0f172a;
        padding: 2rem;
        border-radius: 12px;
        border: 1px solid #334155;
        margin-bottom: 2.5rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.2rem;
    }
    .article-title {
        color: #38bdf8;
        margin: 0;
        font-size: 1.6rem;
        text-align: center;
        line-height: 1.3;
    }
    .image-showcase {
        width: 180px;
        height: 180px;
        background: white;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        padding: 0.5rem;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    }
    .image-showcase img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
    }
    .no-image-mini {
        display: flex;
        flex-direction: column;
        align-items: center;
        color: #94a3b8;
        font-size: 1rem;
        font-weight: bold;
        gap: 0.3rem;
    }
    
    .stock-info { 
        display: inline-flex; 
        align-items: center; 
        gap: 0.6rem; 
        font-weight: bold; 
        font-size: 1.1rem; 
        color: #86efac; 
        background: rgba(34, 197, 94, 0.15); 
        padding: 0.6rem 1.2rem; 
        border-radius: 8px; 
        border: 1px solid #22c55e; 
    }
    .stock-info .indicator { 
        width: 12px; 
        height: 12px; 
        border-radius: 50%; 
        background: #22c55e; 
        box-shadow: 0 0 8px #22c55e; 
    }
    .stock-info.low-stock { 
        color: #fca5a5; 
        background: rgba(239, 68, 68, 0.15); 
        border-color: #ef4444; 
    }
    .stock-info.low-stock .indicator { 
        background: #ef4444; 
        box-shadow: 0 0 8px #ef4444; 
    }
    
    .article-profile-panel-mini {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        background: #0f172a;
        padding: 1rem 1.5rem;
        border-radius: 12px;
        border: 1px solid #334155;
        margin-bottom: 1.5rem;
    }
    .image-showcase-mini {
        width: 60px;
        height: 60px;
        background: white;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        padding: 0.2rem;
    }
    .image-showcase-mini img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
    }
    .article-title-mini {
        color: #38bdf8;
        margin: 0;
        font-size: 1.2rem;
        text-align: left;
    }

    .retrigger-form { position: absolute; top: 1.5rem; right: 1.5rem; margin: 0; z-index: 10; }
    .btn-retrigger-led { background: rgba(59, 130, 246, 0.1); border: 1px dashed rgba(59, 130, 246, 0.4); color: #38bdf8; padding: 0.5rem 0.8rem; border-radius: 8px; font-size: 0.95rem; font-weight: bold; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 0.4rem; }
    .btn-retrigger-led:hover { background: rgba(59, 130, 246, 0.2); border-style: solid; color: white; transform: translateY(-1px); box-shadow: 0 4px 10px rgba(59, 130, 246, 0.2); }
    .scan-card { cursor: pointer; }
    
    .hidden-scan-input { position: absolute; left: -9999px; top: -9999px; opacity: 0; height: 1px; width: 1px; }
    
    .error-box { background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; color: #ef4444; padding: 1rem; border-radius: 8px; margin-top: 1.5rem; font-weight: bold; }
    .scale-animation { margin-top: 2rem; padding: 2rem; background: rgba(59, 130, 246, 0.1); border-radius: 12px; border: 1px dashed #3b82f6; }
    .spinner { width: 50px; height: 50px; border: 5px solid #334155; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1.5rem auto; }
    .stats-grid { display: flex; justify-content: center; gap: 2rem; margin-bottom: 2rem; }
    .stat-box { display: flex; flex-direction: column; background: #0f172a; padding: 1rem; border-radius: 8px; border: 1px solid #334155; min-width: 150px; }
    .stat-box .label { color: #94a3b8; font-size: 0.9rem; text-transform: uppercase; }
    .stat-box .value { font-size: 1.5rem; font-weight: bold; color: #38bdf8; }
    .huge-btn { width: 100%; background: #3b82f6; color: white; border: none; padding: 1.5rem; border-radius: 12px; font-size: 1.2rem; font-weight: bold; cursor: pointer; transition: all 0.2s; }
    .huge-btn:hover { filter: brightness(1.1); transform: translateY(-2px); }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-15px); } }
</style>