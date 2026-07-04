<script>
    import { enhance } from '$app/forms'; 
    import { invalidateAll } from '$app/navigation'; 
    import { onDestroy } from 'svelte';

    export let data;

    $: article = data.article;
    $: categories = data.categories;
    $: attributes = data.attributes;
    $: originalStock = article.istBestand || 0;

    $: displaySlots = (() => {
        let slots = [];
        if (Array.isArray(article.assigned_barcodes) && article.assigned_barcodes.length > 0) {
            slots = article.assigned_barcodes.map(b => typeof b === 'object' ? b.barcode : b);
        } else if (article.assigned_barcode) {
            slots = [article.assigned_barcode];
        }
        return slots;
    })();

    let showModal = false;
    let wizardState = 'scan'; 
    
    let activeBarcode = '';
    let boxWeight = 0;
    let itemWeight = 0;
    let tempTotalWeight = 0;
    
    let measuredWeight = 0;
    let calculatedStock = 0;

    let requestId = null;
    let pollInterval = null;

    let barcodeError = false; 
    let showConflictModal = false;
    let conflictingArticle = null;
    let showUnlinkConflictConfirmation = false;
    
    let showUnlinkConfirmation = false;
    let showSingleUnlinkConfirmation = false;
    let barcodeToUnlink = null;

    let scanInput = '';
    let scanInputRef;

    $: conflictDisplayAttributes = (() => {
        let arr = [];
        if (conflictingArticle && conflictingArticle.attributes) {
            for (const [attrId, value] of Object.entries(conflictingArticle.attributes)) {
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

    function openWizard() {
        if (displaySlots.length >= 10) return; // Sicherheits-Blockade
        showModal = true;
        wizardState = 'scan';
        barcodeError = false;
        showConflictModal = false;
        scanInput = '';
        setTimeout(() => scanInputRef?.focus(), 100);
    }

    function closeWizard() {
        showModal = false;
        if (pollInterval) clearInterval(pollInterval);
    }

    function focusOnInit(node) {
        node.focus();
        return { destroy() {} };
    }

    function startPolling(step) {
        if (pollInterval) clearInterval(pollInterval);
        
        pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/scale/${requestId}`);
                const data = await res.json();

                if (data.status === 'done' && data.weight !== null) {
                    clearInterval(pollInterval);
                    
                    if (step === 'box') {
                        boxWeight = data.weight;
                        if (article.attributes && article.attributes.itemWeight) {
                            wizardState = 'ask_item_weight';
                        } else {
                            wizardState = 'weigh_item';
                        }
                    } else if (step === 'item') {
                        tempTotalWeight = data.weight;
                        itemWeight = Math.max(0.1, tempTotalWeight - boxWeight); 
                        wizardState = 'summary';
                    } else if (step === 'total_stock') {
                        measuredWeight = data.weight;
                        const netWeight = Math.max(0, measuredWeight - boxWeight);
                        calculatedStock = Math.round(netWeight / itemWeight);
                        wizardState = 'confirm_total_stock';
                    }
                }
            } catch (err) {
                console.error("Polling Fehler", err);
            }
        }, 500);
    }

    onDestroy(() => {
        if (pollInterval) clearInterval(pollInterval);
    });
</script>

<div class="terminal-page space-grotesk">
    <div class="header">
        <div class="title-area">
            <h1 class="page-title">{article.title}</h1>
            {#if article.sku}
                <span class="sku-badge">SKU: {article.sku}</span>
            {/if}
        </div>
        <a href="/terminal/settings/assign" class="btn-back">
            <span class="icon">←</span> Zurück zur Übersicht
        </a>
    </div>

    <div class="article-layout">
        <div class="left-column">
            <div class="image-section">
                {#if article.imagePath}
                    <img src={article.imagePath} alt={article.title} class="main-image" >
                {:else}
                    <div class="no-image-placeholder">
                        <span class="icon">📷</span>
                        <p>Kein Bild verfügbar</p>
                    </div>
                {/if}
            </div>

            <!-- Dynamischer Button (Ausgegraut wenn 10 Fächer erreicht) -->
            {#if displaySlots.length >= 10}
                <button class="hardware-trigger-btn primary-action disabled" disabled>
                    <span class="icon-large">🛑</span>
                    <div class="btn-text">
                        <strong>Maximum erreicht</strong>
                        <span>Maximal 10 Fächer pro Artikel.</span>
                    </div>
                </button>
            {:else}
                <button class="hardware-trigger-btn primary-action" on:click={openWizard}>
                    <span class="icon-large">📠</span>
                    <div class="btn-text">
                        <strong>Neues Fach zuweisen</strong>
                        <span>Barcode scannen & Gewicht erfassen</span>
                    </div>
                </button>
            {/if}

            {#if displaySlots.length > 0}
                <button class="btn-unlink-secondary" on:click={() => showUnlinkConfirmation = true}>
                    <span class="icon">🗑️</span> Alle Verknüpfungen entfernen
                </button>
            {/if}
        </div>

        <div class="info-section">
            <div class="drawer-highlight">
                <div class="highlight-header">
                    <span class="icon">🗄️</span>
                    <span class="label">Zugewiesene Lagerplätze</span>
                    <!-- 10er Limit in der Anzeige -->
                    <span class="badge">{displaySlots.length} / 10 Belegt</span>
                </div>
                
                <div class="slot-list">
                    <!-- Dynamische Liste ohne leere Platzhalter -->
                    {#if displaySlots.length === 0}
                        <div class="slot-item empty" style="justify-content: center; padding: 2rem;">
                            <span class="empty-text">Noch keine Fächer zugewiesen.</span>
                        </div>
                    {:else}
                        {#each displaySlots as slotBarcode, index}
                            <div class="slot-item occupied">
                                <span class="slot-number">Platz {index + 1}</span>
                                <div class="barcode-display">
                                    <span class="icon">📟</span>
                                    <strong>{slotBarcode}</strong>
                                    <button class="btn-icon-danger" on:click={() => { barcodeToUnlink = slotBarcode; showSingleUnlinkConfirmation = true; }} title="Diesen Platz freigeben">
                                        ✕
                                    </button>
                                </div>
                            </div>
                        {/each}
                    {/if}
                </div>
            </div>
            
            <div class="meta-grid">
                <div class="meta-item">
                    <div class="meta-icon">⚖️</div>
                    <div class="meta-content">
                        <span class="meta-label">Messverfahren</span>
                        <span class="meta-value">Fach-Gesamtgewicht</span>
                    </div>
                </div>
                <div class="meta-item">
                    <div class="meta-icon">🔩</div>
                    <div class="meta-content">
                        <span class="meta-label">Artikel-Stückgewicht</span>
                        <span class="meta-value highlight-blue">{article.attributes?.itemWeight ? `${parseFloat(article.attributes.itemWeight).toFixed(2)} g` : '-'}</span>
                    </div>
                </div>
                <div class="meta-item total-stock-item">
                    <div class="meta-icon">📦</div>
                    <div class="meta-content">
                        <span class="meta-label">Gesamter Bestand</span>
                        <span class="meta-value highlight-green">{originalStock} <small>Stk.</small></span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- ============================================== -->
<!-- DER SETUP-WIZARD MODAL                         -->
<!-- ============================================== -->
{#if showModal}
    <div class="modal-backdrop"></div>
    <div class="modal-window scan-modal">
        <div class="modal-header">
            <h3><span class="icon">⚙️</span> Setup-Assistent</h3>
            <button class="btn-close-modal" on:click={closeWizard}>✕</button>
        </div>
        
        <div class="modal-body">
            
            {#if wizardState === 'scan'}
                {#if barcodeError}
                    <div class="warning-box error-box">
                        <span class="warning-icon">❌</span>
                        <div>
                            <h4>Unbekannter Barcode!</h4>
                            <p>Der Barcode wurde im System nicht gefunden.</p>
                        </div>
                    </div>
                    <button class="btn-primary full-width mt-2" on:click={() => {barcodeError=false; scanInput=''; setTimeout(() => scanInputRef?.focus(), 100);}}>
                        Erneut scannen
                    </button>
                {:else}
                    <div class="step-indicator">Schritt 1 von 3</div>
                    <div class="emoji-hero">📠</div>
                    <h2 class="step-title text-blue">1. Barcode scannen</h2>
                    <p class="step-desc">Scanne den Barcode des Regalfachs, das du zuweisen möchtest.</p>

                    <form method="POST" action="?/checkBarcode" use:enhance={() => {
                        return async ({ result, update }) => {
                            if (result.data && !result.data.success) {
                                if (result.data.error === 'not_in_shelves') { barcodeError = true; return; }
                                if (result.data.error === 'already_assigned') {
                                    conflictingArticle = result.data.conflictingArticle;
                                    activeBarcode = result.data.barcode;
                                    showConflictModal = true; showModal = false; return;
                                }
                            }
                            activeBarcode = result.data.barcode;
                            wizardState = 'weigh_box';
                        };
                    }}>
                        <div class="scan-animation-wrapper" on:click={() => scanInputRef?.focus()}>
                            <div class="scan-line"></div>
                            <span>Warte auf Scanner-Eingabe...</span>
                        </div>
                        <input bind:this={scanInputRef} bind:value={scanInput} type="text" name="barcode" class="hidden-scan-input" required use:focusOnInit>
                        <button type="submit" style="display: none;"></button>
                    </form>
                {/if}

            {:else if wizardState === 'weigh_box'}
                <div class="step-indicator">Schritt 2 von 3</div>
                <div class="emoji-hero">📦</div>
                <h2 class="step-title text-yellow">2. Leeres Fach wiegen (Tara)</h2>
                <p class="step-desc">Nimm das <strong>leere Fach</strong> aus dem Regal und stelle es auf die Waage.</p>

                <form method="POST" action="?/requestScale" use:enhance={() => {
                    wizardState = 'weigh_box_polling';
                    return async ({ result }) => {
                        if(result.data.success) { requestId = result.data.requestId; startPolling('box'); }
                    };
                }}>
                    <button type="submit" class="btn-primary huge-btn btn-yellow mt-3">
                        Waage starten
                    </button>
                </form>

            {:else if wizardState === 'weigh_box_polling'}
                <div class="scale-animation box-shadow-glow">
                    <div class="spinner"></div>
                    <h2>Messe Leergewicht...</h2>
                    <p>Bitte das Fach ruhig auf der Waage stehen lassen.</p>
                </div>

            {:else if wizardState === 'ask_item_weight'}
                <div class="step-indicator">Schritt 3 von 3</div>
                <div class="emoji-hero">⚖️</div>
                <h2 class="step-title text-green">Stückgewicht bekannt</h2>
                <p class="step-desc">In der Datenbank ist für diesen Artikel bereits ein Gewicht von <strong class="highlight-text">{parseFloat(article.attributes.itemWeight).toFixed(2)} g</strong> pro Stück hinterlegt.</p>

                <div class="button-stack mt-3">
                    <button type="button" class="btn-primary huge-btn btn-green" on:click={() => { itemWeight = parseFloat(article.attributes.itemWeight); wizardState = 'summary'; }}>
                        <span class="icon">✅</span> Bekanntes Gewicht nutzen
                    </button>
                    <button type="button" class="btn-cancel full-width" on:click={() => wizardState = 'weigh_item'}>
                        <span class="icon">🔄</span> Nein, Gewicht neu messen
                    </button>
                </div>

            {:else if wizardState === 'weigh_item'}
                <div class="step-indicator">Schritt 3 von 3</div>
                <div class="emoji-hero">🔩</div>
                <h2 class="step-title text-green">3. Einzelgewicht ermitteln</h2>
                <p class="step-desc">Lege nun <strong class="highlight-text">exakt 1 Stück</strong> des Artikels in das Fach auf der Waage.</p>

                <form method="POST" action="?/requestScale" use:enhance={() => {
                    wizardState = 'weigh_item_polling';
                    return async ({ result }) => {
                        if(result.data.success) { requestId = result.data.requestId; startPolling('item'); }
                    };
                }}>
                    <button type="submit" class="btn-primary huge-btn btn-green mt-3">
                        Waage starten
                    </button>
                </form>

            {:else if wizardState === 'weigh_item_polling'}
                <div class="scale-animation box-shadow-glow">
                    <div class="spinner"></div>
                    <h2>Messe Einzelgewicht...</h2>
                    <p>Berechne das genaue Gewicht des Artikels.</p>
                </div>

            {:else if wizardState === 'summary'}
                <h2 class="step-title text-blue mb-2">Setup-Daten prüfen</h2>
                
                <div class="stats-grid modern-stats">
                    <div class="stat-box">
                        <span class="label">Barcode</span>
                        <span class="value text-white">{activeBarcode}</span>
                    </div>
                    <div class="stat-box">
                        <span class="label">Leeres Fach</span>
                        <span class="value text-yellow">{boxWeight.toFixed(2)} g</span>
                    </div>
                    <div class="stat-box">
                        <span class="label">Einzelgewicht</span>
                        <span class="value text-green">{itemWeight.toFixed(2)} g</span>
                    </div>
                </div>

                <form method="POST" action="?/saveAll" use:enhance={() => {
                    return async ({ update, result }) => {
                        await update();
                        await invalidateAll();
                        if (result.data?.success) {
                            wizardState = 'ask_stock_calc';
                        }
                    };
                }}>
                    <input type="hidden" name="articleId" value={article._id}>
                    <input type="hidden" name="barcode" value={activeBarcode}>
                    
                    <!-- 🔥 HIER: Volle 3 Kommastellen für die DB-Speicherung! -->
                    <input type="hidden" name="boxWeight" value={boxWeight.toFixed(3)}>
                    <input type="hidden" name="itemWeight" value={itemWeight.toFixed(3)}>
                    
                    <button type="submit" class="btn-primary huge-btn btn-blue mt-3">
                        <span class="icon">💾</span> Verknüpfung speichern & Weiter
                    </button>
                </form>

            {:else if wizardState === 'ask_stock_calc'}
                <div class="emoji-hero">🎉</div>
                <h2 class="step-title text-green">Fach erfolgreich verknüpft!</h2>
                <div class="info-card mb-3">
                    <p>Möchtest du das Fach jetzt direkt mit <strong>{article.title}</strong> füllen und den Bestand ermitteln?</p>
                </div>

                <div class="button-stack">
                    <button type="button" class="btn-primary huge-btn btn-green" on:click={() => wizardState = 'weigh_total_stock'}>
                        <span class="icon">📦</span> Ja, Fach befüllen & wiegen
                    </button>
                    
                    <form method="POST" action="?/triggerLedOnly" use:enhance={() => {
                        return async () => { wizardState = 'success'; };
                    }}>
                        <input type="hidden" name="barcode" value={activeBarcode}>
                        <button type="submit" class="btn-cancel full-width">
                            Nein, leeres Fach in den Schrank räumen
                        </button>
                    </form>
                </div>

            {:else if wizardState === 'weigh_total_stock'}
                <div class="emoji-hero">⚖️</div>
                <h2 class="step-title text-yellow">Bestand erfassen</h2>
                <p class="step-desc">Fülle nun alle <strong>{article.title}</strong> in das Fach und stelle es auf die Waage.</p>

                <form method="POST" action="?/requestScale" use:enhance={() => {
                    wizardState = 'weigh_total_stock_polling';
                    return async ({ result }) => {
                        if(result.data.success) { requestId = result.data.requestId; startPolling('total_stock'); }
                    };
                }}>
                    <button type="submit" class="btn-primary huge-btn btn-yellow mt-3">Messung starten</button>
                </form>

            {:else if wizardState === 'weigh_total_stock_polling'}
                <div class="scale-animation box-shadow-glow">
                    <div class="spinner"></div>
                    <h2>Messe Bestand...</h2>
                    <p>Waage beruhigt sich.</p>
                </div>

            {:else if wizardState === 'confirm_total_stock'}
                <h2 class="step-title mb-2">Messergebnis</h2>
                
                <div class="stats-grid modern-stats mb-2">
                    <div class="stat-box">
                        <span class="label">Gesamtgewicht</span>
                        <!-- 🔥 HIER: Anzeige auf 2 Kommastellen -->
                        <span class="value">{measuredWeight.toFixed(2)} g</span>
                    </div>
                    <div class="stat-box">
                        <span class="label">Netto (ohne Box)</span>
                        <!-- 🔥 HIER: Anzeige auf 2 Kommastellen -->
                        <span class="value text-blue">{Math.max(0, measuredWeight - boxWeight).toFixed(2)} g</span>
                    </div>
                </div>

                <div class="result-card">
                    <span class="label">Ermittelter Bestand</span>
                    <h3 class="result-value">{calculatedStock} <small>Stück</small></h3>
                </div>

                <form method="POST" action="?/updateStockAndLightUp" use:enhance={() => {
                    return async ({ update, result }) => {
                        await update();
                        await invalidateAll();
                        if (result.data?.success) { wizardState = 'success'; setTimeout(() => closeWizard(), 4000); }
                    };
                }}>
                    <input type="hidden" name="articleId" value={article._id}>
                    <input type="hidden" name="barcode" value={activeBarcode}>
                    <input type="hidden" name="newStock" value={calculatedStock}>
                    
                    <button type="submit" class="btn-primary huge-btn btn-blue mt-3">
                        <span class="icon">✨</span> Bestand buchen & Fach leuchten lassen
                    </button>
                </form>

            {:else if wizardState === 'success'}
                <div class="success-animation">
                    <div class="emoji-hero bounce">✅</div>
                    <h2 class="step-title text-green">Alles erledigt!</h2>
                    <div class="info-card mt-2">
                        <p>Das entsprechende Fach im Regal leuchtet nun für 10 Sekunden auf.</p>
                        <strong>Bitte räume die Box jetzt ein.</strong>
                    </div>
                </div>
            {/if}
        </div>
    </div>
{/if}

<!-- ============================================== -->
<!-- KONFLIKT-MODAL (DIREKTE AUFLÖSUNG IM POPUP)    -->
<!-- ============================================== -->
{#if showConflictModal && conflictingArticle}
    <div class="modal-overlay">
        <div class="modal-content conflict-modal-modern">
            <div class="modal-header header-error">
                <h3><span class="icon">⚠️</span> Doppelbelegung blockiert!</h3>
                <button class="btn-close-modal text-white" on:click={() => { showConflictModal = false; openWizard(); }}>✕</button>
            </div>
            
            <div class="modal-body">
                {#if !showUnlinkConflictConfirmation}
                    <div class="warning-box error-box mb-3">
                        <span class="warning-icon">🛑</span>
                        <div>
                            <h4>Fach ist bereits belegt!</h4>
                            <p>Dieses Fach ist aktuell fest dem Artikel <strong>{conflictingArticle.title}</strong> zugewiesen.</p>
                        </div>
                    </div>
                    
                    <div class="conflict-article-card">
                        <div class="conflict-image">
                            {#if conflictingArticle.imagePath}
                                <img src={conflictingArticle.imagePath} alt={conflictingArticle.title} >
                            {:else}
                                <div class="no-image-mini">Kein Bild</div>
                            {/if}
                        </div>
                        <div class="conflict-details">
                            <h4>{conflictingArticle.title}</h4>
                            {#if conflictingArticle.sku}<span class="sku">SKU: {conflictingArticle.sku}</span>{/if}
                        </div>
                    </div>
                    
                    <div class="button-row mt-3 flex-end">
                        <button type="button" class="btn-cancel" on:click={() => { showConflictModal = false; openWizard(); }}>Abbrechen</button>
                        <button type="button" class="btn-primary btn-red" on:click={() => showUnlinkConflictConfirmation = true}>
                            Verknüpfung auflösen & hier nutzen
                        </button>
                    </div>
                {:else}
                    <div class="text-center p-4">
                        <div class="emoji-hero mb-2">🗑️</div>
                        <h3 class="text-white mb-1">Verknüpfung wirklich auflösen?</h3>
                        <p class="text-gray mb-3">Du entfernst das Fach <strong>{activeBarcode}</strong> vom Artikel <strong>{conflictingArticle.title}</strong>.</p>
                        
                        <form method="POST" action="?/unlinkBarcode" use:enhance={() => { 
                            return async ({ update }) => { 
                                await update(); 
                                await invalidateAll(); 
                                showUnlinkConflictConfirmation = false; 
                                showConflictModal = false; 
                                showModal = true;
                                wizardState = 'weigh_box';
                            }; 
                        }}>
                            <input type="hidden" name="articleId" value={conflictingArticle._id}>
                            <input type="hidden" name="barcode" value={activeBarcode}>
                            <div class="button-row justify-center mt-3">
                                <button type="button" class="btn-cancel" on:click={() => showUnlinkConflictConfirmation = false}>Abbrechen</button>
                                <button type="submit" class="btn-primary btn-red">Ja, Platz übernehmen</button>
                            </div>
                        </form>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<!-- ============================================== -->
<!-- MODAL: EINZELNES FACH LÖSCHEN                  -->
<!-- ============================================== -->
{#if showSingleUnlinkConfirmation && barcodeToUnlink}
    <div class="modal-backdrop" on:click={() => showSingleUnlinkConfirmation = false}></div>
    <div class="modal-window scan-modal">
        <div class="modal-header header-error">
            <h3><span class="icon">⚠️</span> Lagerplatz freigeben?</h3>
            <button class="btn-close-modal text-white" on:click={() => showSingleUnlinkConfirmation = false}>✕</button>
        </div>
        <div class="modal-body text-center p-4">
            <div class="emoji-hero mb-2">🗑️</div>
            <h3 class="text-white mb-1">Diesen Lagerplatz freigeben?</h3>
            <p class="text-gray mb-3">Barcode <strong class="text-white">{barcodeToUnlink}</strong> wird von diesem Artikel gelöst. Die LED dieses Fachs leuchtet künftig nicht mehr auf.</p>
            
            <form method="POST" action="?/unlinkBarcode" use:enhance={() => { 
                return async ({ update }) => { 
                    await update(); 
                    await invalidateAll(); 
                    showSingleUnlinkConfirmation = false;
                    barcodeToUnlink = null; 
                }; 
            }}>
                <input type="hidden" name="articleId" value={article._id} >
                <input type="hidden" name="barcode" value={barcodeToUnlink} >
                <div class="button-row justify-center mt-3">
                    <button type="button" class="btn-cancel" on:click={() => showSingleUnlinkConfirmation = false}>Abbrechen</button>
                    <button type="submit" class="btn-primary btn-red">Ja, Platz freigeben</button>
                </div>
            </form>
        </div>
    </div>
{/if}

<!-- ============================================== -->
<!-- MODAL: ALLE FÄCHER LÖSCHEN                     -->
<!-- ============================================== -->
{#if showUnlinkConfirmation && !showModal}
    <div class="modal-backdrop" on:click={() => showUnlinkConfirmation = false}></div>
    <div class="modal-window scan-modal">
        <div class="modal-header header-error">
            <h3><span class="icon">⚠️</span> Alle Barcodes entfernen?</h3>
            <button class="btn-close-modal text-white" on:click={() => showUnlinkConfirmation = false}>✕</button>
        </div>
        <div class="modal-body text-center p-4">
            <div class="emoji-hero mb-2">🗑️</div>
            <h3 class="text-white mb-1">Alle Verknüpfungen aufheben?</h3>
            <p class="text-gray mb-3">Alle zugewiesenen Fächer werden von diesem Artikel gelöst. Die Hardware-LEDs werden für diesen Artikel nicht mehr leuchten.</p>
            
            <form method="POST" action="?/unlinkBarcode" use:enhance={() => { return async ({ update }) => { await update(); await invalidateAll(); showUnlinkConfirmation = false; }; }}>
                <input type="hidden" name="articleId" value={article._id} >
                <div class="button-row justify-center mt-3">
                    <button type="button" class="btn-cancel" on:click={() => showUnlinkConfirmation = false}>Abbrechen</button>
                    <button type="submit" class="btn-primary btn-red">Ja, endgültig entfernen</button>
                </div>
            </form>
        </div>
    </div>
{/if}

<style>
    /* --- Globale Variablen & Basis --- */
    :root {
        --bg-dark: #0f172a;
        --bg-card: #1e293b;
        --bg-card-hover: #334155;
        --border-color: #334155;
        --border-highlight: #475569;
        
        --text-main: #f8fafc;
        --text-muted: #94a3b8;
        
        --color-blue: #3b82f6;
        --color-blue-hover: #2563eb;
        --color-blue-light: #60a5fa;
        
        --color-green: #22c55e;
        --color-green-hover: #16a34a;
        
        --color-red: #ef4444;
        --color-red-hover: #dc2626;
        --color-red-light: #fca5a5;
        
        --color-yellow: #f59e0b;
        --color-yellow-hover: #d97706;
        
        --shadow-sm: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        --shadow-md: 0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.15);
        --shadow-lg: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2);
        --shadow-glow-blue: 0 0 15px rgba(59, 130, 246, 0.3);
        
        --radius-md: 12px;
        --radius-lg: 16px;
        --radius-xl: 24px;
    }

    .terminal-page { max-width: 1400px; margin: 0 auto; padding: 2rem; color: var(--text-main); }
    
    /* --- Utility Classes --- */
    .mt-1 { margin-top: 0.5rem; } .mt-2 { margin-top: 1rem; } .mt-3 { margin-top: 1.5rem; }
    .mb-1 { margin-bottom: 0.5rem; } .mb-2 { margin-bottom: 1rem; } .mb-3 { margin-bottom: 1.5rem; }
    .p-4 { padding: 2rem; }
    .text-center { text-align: center; }
    .text-white { color: white !important; }
    .text-gray { color: var(--text-muted); }
    .text-blue { color: var(--color-blue-light); }
    .text-green { color: var(--color-green); }
    .text-yellow { color: var(--color-yellow); }
    .text-red-light { color: var(--color-red-light); }
    .full-width { width: 100%; }
    .flex-end { justify-content: flex-end; }
    .justify-center { justify-content: center; }

    /* --- Header --- */
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 3rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1.5rem; }
    .title-area { display: flex; flex-direction: column; gap: 0.5rem; }
    .page-title { color: var(--color-green); margin: 0; font-size: 2.5rem; letter-spacing: -0.02em; }
    .sku-badge { align-self: flex-start; background: var(--bg-card); border: 1px solid var(--border-highlight); color: var(--text-muted); padding: 0.3rem 0.8rem; border-radius: 20px; font-size: 0.9rem; font-family: monospace; font-weight: bold; }
    .btn-back { display: flex; align-items: center; gap: 0.5rem; background: var(--bg-card); color: white; padding: 0.8rem 1.2rem; border-radius: var(--radius-md); border: 1px solid var(--border-highlight); text-decoration: none; font-weight: 600; transition: all 0.2s; }
    .btn-back:hover { background: var(--bg-card-hover); transform: translateY(-2px); }

    /* --- Layout --- */
    .article-layout { display: grid; grid-template-columns: 450px 1fr; gap: 3rem; align-items: start; }
    .left-column { display: flex; flex-direction: column; gap: 1.5rem; position: sticky; top: 2rem; }
    .info-section { display: flex; flex-direction: column; gap: 2rem; }

    /* --- Image Section --- */
    .image-section { background: white; border-radius: var(--radius-lg); height: 350px; display: flex; align-items: center; justify-content: center; padding: 1rem; box-shadow: var(--shadow-sm); overflow: hidden; }
    .main-image { max-width: 100%; max-height: 100%; object-fit: contain; mix-blend-mode: multiply; }
    .no-image-placeholder { display: flex; flex-direction: column; align-items: center; gap: 1rem; color: #cbd5e1; }
    .no-image-placeholder .icon { font-size: 3rem; filter: grayscale(1); opacity: 0.5; }

    /* --- Primary Action Button --- */
    .hardware-trigger-btn { background: linear-gradient(135deg, var(--color-blue), #2563eb); color: white; border: none; padding: 2rem 1.5rem; border-radius: var(--radius-lg); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 1.5rem; box-shadow: var(--shadow-glow-blue); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); text-align: left; }
    .hardware-trigger-btn:hover:not(.disabled) { transform: translateY(-4px); box-shadow: 0 12px 25px rgba(59, 130, 246, 0.4); }
    .hardware-trigger-btn:active:not(.disabled) { transform: translateY(0); }
    .hardware-trigger-btn.disabled { background: var(--bg-card); border: 1px solid var(--border-highlight); color: var(--text-muted); cursor: not-allowed; box-shadow: none; opacity: 0.7; }
    .hardware-trigger-btn.disabled .icon-large { filter: grayscale(1); }
    .hardware-trigger-btn .icon-large { font-size: 3rem; }
    .hardware-trigger-btn .btn-text { display: flex; flex-direction: column; gap: 0.3rem; }
    .hardware-trigger-btn .btn-text strong { font-size: 1.4rem; font-weight: 800; letter-spacing: 0.02em; }
    .hardware-trigger-btn .btn-text span { font-size: 0.95rem; opacity: 0.9; font-weight: 500; }

    .btn-unlink-secondary { display: flex; align-items: center; justify-content: center; gap: 0.5rem; background: transparent; color: var(--color-red); border: 1px dashed var(--color-red); padding: 1rem; border-radius: var(--radius-md); font-weight: 600; cursor: pointer; font-size: 1rem; transition: all 0.2s; }
    .btn-unlink-secondary:hover { background: rgba(239, 68, 68, 0.1); border-style: solid; }

    /* --- Info Boxes (Right Column) --- */
    .drawer-highlight { background: var(--bg-card); border: 1px solid var(--border-color); padding: 2rem; border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
    .highlight-header { display: flex; align-items: center; gap: 0.8rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; }
    .highlight-header .icon { font-size: 1.5rem; }
    .highlight-header .label { color: white; font-weight: 700; font-size: 1.2rem; flex: 1; }
    .highlight-header .badge { background: rgba(59, 130, 246, 0.2); color: var(--color-blue-light); padding: 0.3rem 0.8rem; border-radius: 20px; font-size: 0.85rem; font-weight: bold; border: 1px solid rgba(59, 130, 246, 0.3); }

    .slot-list { display: flex; flex-direction: column; gap: 0.8rem; }
    .slot-item { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; border-radius: var(--radius-md); border: 1px solid transparent; transition: all 0.2s; }
    .slot-item.occupied { background: rgba(34, 197, 94, 0.05); border-color: rgba(34, 197, 94, 0.2); }
    .slot-item.empty { background: var(--bg-dark); border-color: var(--border-color); }
    .slot-number { color: var(--text-muted); font-weight: 600; font-size: 0.95rem; }
    .barcode-display { display: flex; align-items: center; gap: 0.5rem; color: var(--color-green); font-family: monospace; font-size: 1.1rem; }
    .empty-text { color: #64748b; font-style: italic; font-size: 0.95rem; }

    .btn-icon-danger { background: rgba(239, 68, 68, 0.1); color: var(--color-red); border: 1px solid transparent; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; font-size: 0.8rem; margin-left: 0.5rem; }
    .btn-icon-danger:hover { background: var(--color-red); color: white; box-shadow: 0 0 10px rgba(239, 68, 68, 0.4); border-color: var(--color-red); }

    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
    .meta-item { display: flex; align-items: center; gap: 1rem; background: var(--bg-card); padding: 1.5rem; border-radius: var(--radius-lg); border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); }
    .meta-item.total-stock-item { background: linear-gradient(145deg, var(--bg-card), #152033); border-color: var(--border-highlight); }
    .meta-icon { font-size: 2rem; background: var(--bg-dark); width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
    .meta-content { display: flex; flex-direction: column; gap: 0.2rem; }
    .meta-label { color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; }
    .meta-value { font-size: 1.2rem; font-weight: 800; color: white; }
    .highlight-blue { color: var(--color-blue-light); }
    .highlight-green { color: var(--color-green); font-size: 1.6rem; }
    .meta-value small { font-size: 0.6em; color: var(--text-muted); font-weight: 600; }

    /* --- Modals & Wizard --- */
    .modal-overlay, .modal-backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(4px); z-index: 1000; display: flex; justify-content: center; align-items: center; }
    .modal-window, .modal-content { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--bg-card); border: 1px solid var(--border-highlight); border-radius: var(--radius-xl); z-index: 1001; box-shadow: var(--shadow-lg); overflow: hidden; }
    .scan-modal { width: 95%; max-width: 550px; }
    
    .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem 2rem; border-bottom: 1px solid var(--border-color); background: rgba(0,0,0,0.2); }
    .modal-header h3 { margin: 0; color: white; font-size: 1.2rem; display: flex; align-items: center; gap: 0.5rem; }
    .header-error { background: rgba(239, 68, 68, 0.1); border-bottom-color: rgba(239, 68, 68, 0.3); }
    .header-error h3 { color: var(--color-red); }
    .btn-close-modal { background: none; border: none; color: var(--text-muted); font-size: 1.5rem; cursor: pointer; transition: color 0.2s; padding: 0.5rem; margin: -0.5rem; border-radius: 50%; }
    .btn-close-modal:hover { color: white; background: rgba(255,255,255,0.1); }
    
    .modal-body { padding: 2.5rem 2rem; }
    .text-center .modal-body { text-align: center; }

    /* --- Wizard Elements --- */
    .step-indicator { display: inline-block; background: var(--bg-dark); color: var(--color-blue-light); padding: 0.4rem 1rem; border-radius: 20px; font-weight: 700; font-size: 0.85rem; margin-bottom: 1.5rem; border: 1px solid rgba(59, 130, 246, 0.2); text-transform: uppercase; letter-spacing: 0.05em; }
    .emoji-hero { font-size: 4.5rem; margin-bottom: 1rem; line-height: 1; filter: drop-shadow(0 10px 10px rgba(0,0,0,0.2)); }
    .step-title { margin: 0 0 0.5rem 0; font-size: 1.8rem; letter-spacing: -0.02em; }
    .step-desc { color: var(--text-muted); font-size: 1.1rem; margin-bottom: 2rem; line-height: 1.5; }
    .highlight-text { color: white; font-weight: bold; background: rgba(255,255,255,0.1); padding: 0.2rem 0.5rem; border-radius: 6px; }

    /* --- Scanner Input --- */
    .scan-animation-wrapper { background: var(--bg-dark); border: 2px dashed var(--color-blue); border-radius: var(--radius-md); padding: 2rem; display: flex; flex-direction: column; align-items: center; gap: 1rem; cursor: pointer; position: relative; overflow: hidden; transition: all 0.2s; }
    .scan-animation-wrapper:hover { background: rgba(59, 130, 246, 0.05); border-style: solid; }
    .scan-animation-wrapper span { color: var(--color-blue-light); font-weight: 600; font-family: monospace; letter-spacing: 0.05em; }
    .scan-line { width: 80%; height: 2px; background: var(--color-blue); box-shadow: 0 0 10px var(--color-blue); animation: scan 2s linear infinite; position: absolute; top: 0; }
    .hidden-scan-input { opacity: 0; position: absolute; height: 1px; width: 1px; z-index: -1; }

    /* --- Buttons --- */
    .button-stack { display: flex; flex-direction: column; gap: 1rem; }
    .button-row { display: flex; gap: 1rem; }
    
    .btn-primary { display: flex; align-items: center; justify-content: center; gap: 0.5rem; color: white; border: none; padding: 1rem 1.5rem; border-radius: var(--radius-md); font-weight: 700; cursor: pointer; font-size: 1.05rem; transition: all 0.2s; }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); filter: brightness(1.1); }
    .btn-primary:active { transform: translateY(0); }
    
    .huge-btn { padding: 1.2rem 2rem; font-size: 1.1rem; border-radius: var(--radius-lg); width: 100%; }
    
    .btn-blue { background: var(--color-blue); box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4); }
    .btn-green { background: var(--color-green); box-shadow: 0 4px 14px rgba(34, 197, 94, 0.4); }
    .btn-yellow { background: var(--color-yellow); color: #451a03; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.4); }
    .btn-red { background: var(--color-red); box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4); }
    
    .btn-cancel { background: transparent; border: 1px solid var(--border-highlight); color: var(--text-muted); padding: 1rem 1.5rem; border-radius: var(--radius-md); font-weight: 600; cursor: pointer; font-size: 1rem; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.5rem; }
    .btn-cancel:hover { background: rgba(255,255,255,0.05); color: white; }

    /* --- Warnings & Info Cards --- */
    .warning-box { border-radius: var(--radius-md); padding: 1.5rem; display: flex; align-items: flex-start; gap: 1rem; text-align: left; }
    .error-box { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); }
    .warning-icon { font-size: 2rem; line-height: 1; }
    .warning-box h4 { margin: 0 0 0.4rem 0; color: var(--color-red); font-size: 1.1rem; }
    .warning-box p { margin: 0; color: var(--text-main); font-size: 1rem; line-height: 1.4; }

    .info-card { background: var(--bg-dark); border: 1px solid var(--border-color); padding: 1.5rem; border-radius: var(--radius-md); text-align: left; }
    .info-card p { margin: 0; line-height: 1.5; color: var(--text-muted); }
    .info-card strong { color: white; }

    /* --- Animations --- */
    .scale-animation { padding: 3rem 2rem; background: var(--bg-dark); border-radius: var(--radius-lg); border: 1px solid var(--border-highlight); margin-top: 1.5rem; position: relative; overflow: hidden; }
    .box-shadow-glow { box-shadow: inset 0 0 20px rgba(0,0,0,0.5); }
    .spinner { width: 50px; height: 50px; border: 4px solid var(--border-highlight); border-top-color: var(--color-blue); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1.5rem auto; }
    
    .bounce { animation: bounce 2s infinite; }

    /* --- Data Grids & Results --- */
    .modern-stats { display: flex; gap: 1rem; justify-content: center; background: var(--bg-dark); padding: 1rem; border-radius: var(--radius-lg); border: 1px solid var(--border-color); }
    .modern-stats .stat-box { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; position: relative; }
    .modern-stats .stat-box:not(:last-child)::after { content: ''; position: absolute; right: -0.5rem; top: 10%; height: 80%; width: 1px; background: var(--border-highlight); }
    .modern-stats .label { color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; }
    .modern-stats .value { font-size: 1.4rem; font-weight: 800; }

    .result-card { background: linear-gradient(145deg, var(--bg-dark), #0a101d); padding: 2rem; border-radius: var(--radius-lg); border: 1px solid var(--border-highlight); margin: 1.5rem 0; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; box-shadow: inset 0 2px 10px rgba(0,0,0,0.2); }
    .result-card .label { color: var(--color-blue-light); font-size: 0.9rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; }
    .result-value { font-size: 3.5rem; margin: 0; color: var(--color-green); line-height: 1; }
    .result-value small { font-size: 1.2rem; color: var(--text-muted); font-weight: 600; margin-left: 0.2rem; }

    /* --- Conflict Modal Specifics --- */
    .conflict-modal-modern { width: 95%; max-width: 600px; }
    .conflict-article-card { display: flex; gap: 1.5rem; background: var(--bg-dark); padding: 1.5rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); margin-top: 1rem; align-items: center; }
    .conflict-image { width: 100px; height: 100px; background: white; border-radius: 8px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 0.5rem; }
    .conflict-image img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .no-image-mini { color: #94a3b8; font-size: 0.8rem; font-weight: bold; text-align: center; }
    .conflict-details { flex: 1; display: flex; flex-direction: column; gap: 0.3rem; text-align: left; }
    .conflict-details h4 { margin: 0; color: white; font-size: 1.2rem; }
    .conflict-details .sku { font-family: monospace; color: var(--text-muted); font-size: 0.9rem; }
    .block-link { display: inline-flex; width: auto; align-self: flex-start; padding: 0.6rem 1rem; font-size: 0.95rem; text-decoration: none; border-radius: 8px; margin-top: 0.5rem; }

    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes scan { 0% { top: 0; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
    @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-15px); } }
</style>