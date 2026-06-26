<script>
    import { enhance } from '$app/forms'; 
    import { invalidateAll } from '$app/navigation'; 

    export let data;

    // --- 1. REAKTIVITÄT ---
    $: article = data.article;
    $: categories = data.categories;
    $: attributes = data.attributes;

    $: mainCategory = categories.find(c => c._id === article.mainCategoryId);
    $: mainCategoryName = mainCategory ? mainCategory.name : 'Unbekannte Kategorie';
    
    $: subCategoryName = (() => {
        if (mainCategory && article.subcategoryId) {
            const subCat = mainCategory.subcategories.find(s => s.id === article.subcategoryId);
            return subCat ? subCat.name : "";
        }
        return "";
    })();

    $: displayAttributes = (() => {
        let arr = [];
        if (article.attributes) {
            for (const [attrId, value] of Object.entries(article.attributes)) {
                const attrDef = attributes.find(a => a._id === attrId);
                if (attrDef && value !== undefined && value !== "") {
                    const displayValue = Array.isArray(value) ? value.join(', ') : value;
                    arr.push({
                        label: attrDef.label,
                        value: displayValue,
                        unit: attrDef.unit ? ` ${attrDef.unit.trim()}` : ''
                    });
                }
            }
            arr.sort((a, b) => a.label.localeCompare(b.label, 'de', { sensitivity: 'base' }));
        }
        return arr;
    })();

    $: originalStock = article.istBestand || 0;

    // --- 2. Scanner & Modal States ---
    let showScanner = false;
    let showSuccess = false;
    let showOverwriteWarning = false; 
    let showUnlinkConfirmation = false;
    let barcodeError = false; 
    let lastScannedBarcode = '';

    let scanInput = '';
    let scanInputRef;

    function openScanner() {
        showScanner = true;
        showSuccess = false;
        showOverwriteWarning = false;
        barcodeError = false;
        scanInput = '';
        setTimeout(() => scanInputRef?.focus(), 100);
    }

    function closeScanner() {
        showScanner = false;
        showSuccess = false;
        showOverwriteWarning = false;
        barcodeError = false;
        scanInput = '';
    }

    function resetScannerAfterError() {
        barcodeError = false;
        scanInput = '';
        setTimeout(() => scanInputRef?.focus(), 100);
    }

    function focusOnInit(node) {
        node.focus();
        return { destroy() {} };
    }
</script>

<div class="terminal-page space-grotesk">
    <div class="header">
        <div class="title-area">
            <nav class="breadcrumb">
                <span class="cat">{mainCategoryName}</span>
                {#if subCategoryName}
                    <span class="separator">/</span>
                    <span class="cat">{subCategoryName}</span>
                {/if}
            </nav>
            <h1>{article.title}</h1>
        </div>
        
        <a href="/terminal/settings/assign" class="btn-back">
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            Zurück zur Übersicht
        </a>
    </div>

    <div class="article-layout">
        
        <div class="left-column">
            <div class="image-section">
                {#if article.imagePath}
                    <img src={article.imagePath} alt={article.title} class="main-image" >
                {:else}
                    <div class="no-image-placeholder">
                        <span>Kein Artikelbild vorhanden</span>
                    </div>
                {/if}
            </div>

            <button class="hardware-trigger-btn" on:click={openScanner}>
                <span class="icon">📠</span>
                Artikel Barcode zuweisen
            </button>

            {#if article.assigned_barcode != null && String(article.assigned_barcode).trim() !== ''}
                <button class="btn-unlink-secondary" on:click={() => showUnlinkConfirmation = true}>
                    🗑️ Barcode-Verknüpfung entfernen
                </button>
            {/if}
        </div>

        <div class="info-section">
            <div class="price-stock-box">
                {#if article.price}
                    <div class="price">{article.price.toFixed(2)} CHF <span class="unit">/ Stk.</span></div>
                {/if}
                
                <div class="stock-info" 
                     class:low-stock={article.mindestBestand !== undefined && article.mindestBestand !== null && originalStock <= article.mindestBestand && originalStock > 0} 
                     class:out-of-stock={originalStock === 0}>
                    <span class="indicator"></span>
                    {#if originalStock === 0}
                        Nicht auf Lager
                    {:else}
                        {originalStock} Stück auf Lager
                    {/if}
                </div>
            </div>

            <div class="drawer-highlight">
                <span class="label">Zugewiesener Barcode</span>
                <span class="value" style="font-size: 2rem; color: {article.assigned_barcode ? '#4ade80' : '#ffffff'};">
                    {article.assigned_barcode ? article.assigned_barcode : 'Nicht zugewiesen'}
                </span>
            </div>

            <div class="meta-grid">
                {#if article.supplier}
                    <div class="meta-item">
                        <span class="meta-label">Lieferant</span>
                        <span class="meta-value">{article.supplier}</span>
                    </div>
                {/if}
                {#if article.gtin}
                    <div class="meta-item">
                        <span class="meta-label">GTIN / EAN / Art.Nr.</span>
                        <span class="meta-value">{article.gtin}</span>
                    </div>
                {/if}
                <div class="meta-item">
                    <span class="meta-label">Soll-Bestand</span>
                    <span class="meta-value">{article.sollBestand !== undefined && article.sollBestand !== null ? article.sollBestand : '-'}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Mindestbestand</span>
                    <span class="meta-value">{article.mindestBestand !== undefined && article.mindestBestand !== null ? article.mindestBestand : '-'}</span>
                </div>
            </div>

            {#if article.description}
                <div class="description-box">
                    <h3>Beschreibung</h3>
                    <p>{article.description}</p>
                </div>
            {/if}

            {#if displayAttributes.length > 0}
                <div class="specs-section">
                    <h3>Spezifikationen</h3>
                    <div class="specs-grid">
                        {#each displayAttributes as attr}
                            <div class="spec-row">
                                <span class="spec-label">{attr.label}</span>
                                <span class="spec-value">{attr.value}{attr.unit}</span>
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>

{#if showScanner}
    <div class="modal-backdrop" on:click={() => scanInputRef?.focus()}></div>
    <div class="modal-window scan-modal">
        <div class="modal-header">
            <h3>Barcode verknüpfen</h3>
            <button class="btn-close-modal" on:click={closeScanner}>✕</button>
        </div>
        
        <div class="modal-body" style="text-align: center; padding: 3rem 2rem;">
            {#if showSuccess}
                <div style="font-size: 5rem; margin-bottom: 1rem;">✅</div>
                <h2 style="color: #22c55e; margin-bottom: 0.5rem;">Erfolgreich!</h2>
                <p style="color: #94a3b8; font-size: 1.1rem;">Der Artikel wurde verknüpft.</p>
            
            {:else if barcodeError}
                <div class="warning-box">
                    <span class="warning-icon">❌</span>
                    <div>
                        <h4>Unbekannter Barcode!</h4>
                        <p>Der Barcode <strong class="highlight-code">{lastScannedBarcode}</strong> wurde im System nicht gefunden.</p>
                        <p style="margin-top: 0.5rem;">Ein Fach mit diesem Barcode muss zuerst unter <strong>Fächer anlernen</strong> hinzugefügt werden.</p>
                    </div>
                </div>
                <div class="button-row" style="margin-top: 2rem;">
                    <button type="button" class="btn-cancel" style="background: transparent; border: 1px solid #475569;" on:click={closeScanner}>Abbrechen</button>
                    <button type="button" class="btn-primary" on:click={resetScannerAfterError}>Erneut scannen</button>
                </div>

            {:else}
                <h2 style="color: #38bdf8; margin: 0 0 1rem 0; font-size: 1.5rem;">{article.title}</h2>

                <form method="POST" action="?/linkArticle" use:enhance={({ cancel }) => {
                    if (article.assigned_barcode && !showOverwriteWarning) {
                        cancel(); 
                        if (scanInput.trim() !== '') {
                            showOverwriteWarning = true; 
                        }
                        return;
                    }
                    
                    return async ({ result, update }) => {
                        if (result.data && result.data.success === false && result.data.error === 'not_in_shelves') {
                            barcodeError = true;
                            lastScannedBarcode = scanInput; 
                            scanInput = ''; 
                            return; 
                        }

                        await update();
                        await invalidateAll(); 
                        showSuccess = true;
                        showOverwriteWarning = false;
                        barcodeError = false;
                        setTimeout(() => { closeScanner(); }, 2000);
                    };
                }}>
                    <input type="hidden" name="articleId" value={article._id} >
                    
                    {#if showOverwriteWarning}
                        <div class="warning-box" style="border-color: #f59e0b; background: rgba(245, 158, 11, 0.1);">
                            <span class="warning-icon">⚠️</span>
                            <div>
                                <h4 style="color: #f59e0b;">Achtung: Artikel wird neu zugewiesen!</h4>
                                <p>Dieser Artikel ist bereits mit dem Barcode <strong>{article.assigned_barcode}</strong> verknüpft.</p>
                                <p style="margin-top: 0.5rem;">Soll er nun fest mit dem Barcode <strong class="highlight-code">{scanInput}</strong> überschrieben werden?</p>
                            </div>
                        </div>

                        <input type="hidden" name="barcode" value={scanInput} >

                        <div class="button-row" style="margin-top: 2rem;">
                            <button type="button" class="btn-cancel" on:click={() => {
                                showOverwriteWarning = false;
                                scanInput = '';
                                setTimeout(() => scanInputRef?.focus(), 100);
                            }}>
                                Abbrechen
                            </button>
                            <button type="submit" class="btn-primary" style="background: #f59e0b; color: #000;">Ja, überschreiben</button>
                        </div>
                    {:else}
                        <div class="scanner-prompt pulse-anim">
                            <div style="font-size: 4rem; margin-bottom: 1rem;">📠</div>
                            <h3 style="color: #22c55e; font-size: 1.5rem; margin: 0;">Warte auf Scanner...</h3>
                        </div>

                        <input 
                            bind:this={scanInputRef}
                            bind:value={scanInput}
                            type="text" 
                            name="barcode"
                            class="hidden-scan-input"
                            required
                            use:focusOnInit
                        >
                        <button type="submit" style="display: none;">Verknüpfen</button>
                    {/if}
                </form>
            {/if}
        </div>
    </div>
{/if}

{#if showUnlinkConfirmation}
    <div class="modal-backdrop" on:click={() => showUnlinkConfirmation = false}></div>
    <div class="modal-window scan-modal">
        <div class="modal-header">
            <h3>Barcode entfernen?</h3>
            <button class="btn-close-modal" on:click={() => showUnlinkConfirmation = false}>✕</button>
        </div>
        
        <div class="modal-body" style="text-align: center; padding: 3rem 2rem;">
            <div class="warning-box">
                <span class="warning-icon" style="color: #ef4444;">⚠️</span>
                <div>
                    <h4 style="color: #ef4444;">Verknüpfung wirklich aufheben?</h4>
                    <p>Der Barcode <strong>{article.assigned_barcode}</strong> wird unwiderruflich von diesem Artikel gelöst.</p>
                    <p style="margin-top: 0.5rem;">Der Artikel ist danach physisch <strong>nicht mehr</strong> über das Pick-by-Light System auffindbar!</p>
                </div>
            </div>

            <form method="POST" action="?/unlinkBarcode" use:enhance={() => {
                return async ({ update }) => {
                    await update();
                    await invalidateAll();
                    showUnlinkConfirmation = false;
                };
            }}>
                <input type="hidden" name="articleId" value={article._id} >

                <div class="button-row" style="margin-top: 2rem;">
                    <button type="button" class="btn-cancel" on:click={() => showUnlinkConfirmation = false}>
                        Abbrechen
                    </button>
                    <button type="submit" class="btn-danger">Endgültig entfernen</button>
                </div>
            </form>
        </div>
    </div>
{/if}

<style>
    /* Generelles Layout - Terminal Dark Mode */
    .terminal-page { max-width: 1400px; margin: 0 auto; padding: 1rem 2rem; color: #f8fafc; }

    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid #334155; }
    .title-area h1 { margin: 0.5rem 0 0 0; font-size: 2.5rem; color: #22c55e; line-height: 1.2; }
    
    .breadcrumb { display: flex; align-items: center; gap: 0.5rem; font-size: 1.1rem; color: #94a3b8; }
    .separator { color: #475569; }
    .cat { font-weight: 600; color: #cbd5e1; }

    .btn-back { display: inline-flex; align-items: center; gap: 0.5rem; background: #1e293b; color: #f8fafc; border: 1px solid #475569; padding: 1rem 1.5rem; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 1.2rem; transition: all 0.2s; }
    .btn-back:hover { background: #334155; border-color: #64748b; }

    .article-layout { display: flex; gap: 3rem; align-items: flex-start; }
    .left-column { flex: 0 0 450px; display: flex; flex-direction: column; gap: 1.5rem; position: sticky; top: 2rem; }
    .image-section { background: #ffffff; border-radius: 16px; padding: 2rem; display: flex; align-items: center; justify-content: center; height: 400px; border: 2px solid #334155; }
    .main-image { max-width: 100%; max-height: 100%; object-fit: contain; }
    .no-image-placeholder { color: #94a3b8; font-size: 1.2rem; font-weight: 500; }

    .hardware-trigger-btn { width: 100%; background: #3b82f6; color: white; border: none; padding: 2.5rem 2rem; border-radius: 16px; font-size: 1.5rem; font-weight: bold; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 1rem; transition: all 0.2s; box-shadow: 0 8px 20px rgba(59, 130, 246, 0.25); }
    .hardware-trigger-btn:hover { background: #2563eb; transform: translateY(-3px); }

    .btn-unlink-secondary { width: 100%; background: transparent; color: #ef4444; border: 2px dashed #ef4444; padding: 1.2rem; border-radius: 12px; font-size: 1.1rem; font-weight: bold; cursor: pointer; transition: all 0.2s; margin-top: 1rem; }
    .btn-unlink-secondary:hover { background: rgba(239, 68, 68, 0.1); transform: translateY(-2px); }

    .info-section { flex: 1; display: flex; flex-direction: column; gap: 2rem; }
    .price-stock-box { display: flex; align-items: center; gap: 2rem; flex-wrap: wrap; }
    .price { font-size: 2.5rem; font-weight: 700; color: #38bdf8; }
    .price .unit { font-size: 1.2rem; color: #94a3b8; font-weight: 500; }

    .stock-info { display: inline-flex; align-items: center; gap: 0.8rem; font-weight: bold; font-size: 1.3rem; color: #86efac; background: rgba(34, 197, 94, 0.15); padding: 0.8rem 1.5rem; border-radius: 12px; border: 1px solid #22c55e; }
    .indicator { width: 14px; height: 14px; border-radius: 50%; background: #22c55e; }
    .stock-info.low-stock { color: #fca5a5; background: rgba(239, 68, 68, 0.15); border-color: #ef4444; }
    .stock-info.low-stock .indicator { background: #ef4444; }
    .stock-info.out-of-stock { color: #fca5a5; background: rgba(239, 68, 68, 0.15); border-color: #ef4444; }
    .stock-info.out-of-stock .indicator { background: #ef4444; }

    .drawer-highlight { background: rgba(59, 130, 246, 0.1); border: 2px solid #3b82f6; padding: 1.5rem; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; }
    .drawer-highlight .label { color: #93c5fd; font-size: 1.2rem; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
    .drawer-highlight .value { font-size: 3rem; font-weight: bold; color: #ffffff; }

    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; background: #1e293b; padding: 1.5rem; border-radius: 12px; border: 1px solid #334155; }
    .meta-item { display: flex; flex-direction: column; gap: 0.4rem; }
    .meta-label { font-size: 0.9rem; color: #94a3b8; text-transform: uppercase; font-weight: 600; }
    .meta-value { font-weight: 600; color: #f8fafc; font-size: 1.1rem; }

    .description-box h3, .specs-section h3 { font-size: 1.5rem; color: #f8fafc; margin: 0 0 1rem 0; border-bottom: 2px solid #334155; padding-bottom: 0.8rem; }
    .description-box p { line-height: 1.6; color: #cbd5e1; margin: 0; white-space: pre-wrap; font-size: 1.1rem; }

    .specs-grid { display: flex; flex-direction: column; background: #1e293b; border-radius: 12px; border: 1px solid #334155; overflow: hidden; }
    .spec-row { display: flex; padding: 1rem 1.5rem; border-bottom: 1px solid #334155; font-size: 1.1rem; }
    .spec-row:last-child { border-bottom: none; }
    .spec-row:nth-child(even) { background: #0f172a; }
    .spec-label { width: 40%; color: #94a3b8; font-weight: 600; }
    .spec-value { color: #f8fafc; font-weight: 600; }

    /* Modals & Scanner Styles */
    .modal-backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 1000; }
    .modal-window { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #1e293b; border: 1px solid #475569; width: 90%; border-radius: 12px; z-index: 1001; }
    .modal-header { display: flex; justify-content: space-between; padding: 1.5rem; border-bottom: 1px solid #334155; }
    .modal-header h3 { margin: 0; color: white; }
    .btn-close-modal { background: none; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer; }
    
    .scan-modal { max-width: 600px; }
    .pulse-anim { animation: pulse 2s infinite; }
    .hidden-scan-input { opacity: 0; position: absolute; height: 1px; width: 1px; z-index: -1; }
    
    /* Warnungs- & Fehler-Styles */
    .warning-box { background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; border-radius: 8px; padding: 1.5rem; display: flex; align-items: flex-start; gap: 1rem; text-align: left; margin-bottom: 1.5rem; }
    .warning-icon { font-size: 2rem; line-height: 1; }
    .warning-box h4 { margin: 0 0 0.5rem 0; color: #ef4444; font-size: 1.2rem; }
    .warning-box p { margin: 0; color: #cbd5e1; font-size: 1.1rem; line-height: 1.4; }
    .highlight-code { color: #f8fafc; background: #334155; padding: 0.2rem 0.5rem; border-radius: 4px; font-family: monospace; font-size: 1.2rem; }

    .button-row { display: flex; gap: 1rem; justify-content: center; }
    .btn-cancel { background: #334155; color: white; border: none; padding: 1rem 2rem; border-radius: 8px; font-weight: bold; cursor: pointer; transition: background 0.2s; font-size: 1.1rem; }
    .btn-cancel:hover { background: #475569; }
    .btn-primary { background: #3b82f6; color: white; border: none; padding: 1rem 2rem; border-radius: 8px; font-weight: bold; cursor: pointer; transition: background 0.2s; font-size: 1.1rem; }
    .btn-primary:hover { background: #2563eb; }
    .btn-danger { background: #ef4444; color: white; border: none; padding: 1rem 2rem; border-radius: 8px; font-weight: bold; cursor: pointer; transition: background 0.2s; font-size: 1.1rem; }
    .btn-danger:hover { background: #dc2626; }

    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }

    @media (max-width: 1024px) {
        .article-layout { flex-direction: column; }
        .left-column { flex: auto; width: 100%; position: static; }
        .image-section { height: 350px; }
        .header { flex-direction: column; align-items: flex-start; gap: 1.5rem; }
        .btn-back { align-self: flex-start; width: 100%; justify-content: center; }
    }
</style>