<script>
    import { enhance } from '$app/forms'; 
    import { invalidateAll } from '$app/navigation'; 
    import { onDestroy } from 'svelte';

    export let data;

    $: article = data.article;
    $: categories = data.categories;
    $: attributes = data.attributes;
    $: originalStock = article.istBestand || 0;

    // --- Modal & Wizard States ---
    let showModal = false;
    // Mögliche States: 'scan', 'weigh_box', 'weigh_box_polling', 'ask_item_weight', 'weigh_item', 'weigh_item_polling', 'summary', 'success'
    let wizardState = 'scan'; 
    
    // Daten-Speicher für den Durchlauf
    let activeBarcode = '';
    let boxWeight = 0;
    let itemWeight = 0;
    let tempTotalWeight = 0;

    // Waagen Polling
    let requestId = null;
    let pollInterval = null;

    // Konflikt States
    let barcodeError = false; 
    let showConflictModal = false;
    let conflictingArticle = null;
    let showUnlinkConflictConfirmation = false;
    let showUnlinkConfirmation = false;
    let scanInput = '';
    let scanInputRef;

    // Reaktive Attribute für das Konflikt-Modal
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

    // --- Die Waagen-Logik ---
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
                        
                        // Gabelung: Hat der Artikel schon ein Stückgewicht?
                        if (article.attributes && article.attributes.itemWeight) {
                            wizardState = 'ask_item_weight';
                        } else {
                            wizardState = 'weigh_item';
                        }
                    } else if (step === 'item') {
                        tempTotalWeight = data.weight;
                        itemWeight = Math.max(0.1, tempTotalWeight - boxWeight); 
                        wizardState = 'summary';
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
            <h1>{article.title}</h1>
        </div>
        <a href="/terminal/settings/assign" class="btn-back">Zurück zur Übersicht</a>
    </div>

    <div class="article-layout">
        <div class="left-column">
            <div class="image-section">
                {#if article.imagePath}
                    <img src={article.imagePath} alt={article.title} class="main-image" >
                {:else}
                    <div class="no-image-placeholder">Kein Bild</div>
                {/if}
            </div>

            <!-- BUTTON STARTET NUN DEN WIZARD -->
            <button class="hardware-trigger-btn" on:click={openWizard}>
                <span class="icon">📠</span> Barcode & Gewicht zuweisen
            </button>

            {#if article.assigned_barcode != null && String(article.assigned_barcode).trim() !== ''}
                <button class="btn-unlink-secondary" on:click={() => showUnlinkConfirmation = true}>
                    🗑️ Verknüpfung entfernen
                </button>
            {/if}
        </div>

        <div class="info-section">
            <div class="drawer-highlight">
                <span class="label">Zugewiesener Barcode</span>
                <span class="value" style="font-size: 2rem; color: {article.assigned_barcode ? '#4ade80' : '#ffffff'};">
                    {article.assigned_barcode ? article.assigned_barcode : 'Nicht zugewiesen'}
                </span>
            </div>
            <div class="meta-grid">
                <div class="meta-item">
                    <!-- Das Fachgewicht anzeigen (falls geladen) -->
                    <span class="meta-label">Aktuelles Tara (Fach)</span>
                    <span class="meta-value">- g</span> <!-- Zeigen wir hier nur, wenn wir es aus den shelves laden -->
                </div>
                <div class="meta-item">
                    <span class="meta-label">Einzel-Gewicht</span>
                    <span class="meta-value">{article.attributes?.itemWeight ? `${article.attributes.itemWeight} g` : '-'}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Aktueller Bestand</span>
                    <span class="meta-value">{originalStock} Stk.</span>
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
            <h3>Setup-Assistent</h3>
            <button class="btn-close-modal" on:click={closeWizard}>✕</button>
        </div>
        
        <div class="modal-body" style="text-align: center; padding: 2rem;">
            
            <!-- SCHRITT 1: SCANNER -->
            {#if wizardState === 'scan'}
                {#if barcodeError}
                    <div class="warning-box">
                        <span class="warning-icon">❌</span>
                        <div><h4>Unbekannter Barcode!</h4><p>Der Barcode wurde im System nicht gefunden.</p></div>
                    </div>
                    <button class="btn-primary" style="margin-top: 1rem;" on:click={() => {barcodeError=false; scanInput=''; setTimeout(() => scanInputRef?.focus(), 100);}}>Erneut scannen</button>
                {:else}
                    <div class="step-indicator">Schritt 1 von 3</div>
                    <div style="font-size: 4rem; margin-bottom: 1rem;">📠</div>
                    <h2 style="color: #38bdf8;">1. Barcode scannen</h2>
                    <p style="color: #94a3b8;">Scanne den Barcode des Regalfachs.</p>

                    <form method="POST" action="?/checkBarcode" use:enhance={() => {
                        return async ({ result, update }) => {
                            if (result.data && !result.data.success) {
                                if (result.data.error === 'not_in_shelves') { barcodeError = true; return; }
                                if (result.data.error === 'already_assigned') {
                                    conflictingArticle = result.data.conflictingArticle;
                                    showConflictModal = true; showModal = false; return;
                                }
                            }
                            // Erfolg! Barcode speichern und zu Schritt 2 gehen
                            activeBarcode = result.data.barcode;
                            wizardState = 'weigh_box';
                        };
                    }}>
                        <input bind:this={scanInputRef} bind:value={scanInput} type="text" name="barcode" class="hidden-scan-input" required use:focusOnInit>
                        <button type="submit" style="display: none;"></button>
                    </form>
                {/if}

            <!-- SCHRITT 2: FACH WIEGEN -->
            {:else if wizardState === 'weigh_box'}
                <div class="step-indicator">Schritt 2 von 3</div>
                <div style="font-size: 4rem; margin-bottom: 1rem;">📦</div>
                <h2 style="color: #f59e0b;">2. Leeres Fach wiegen (Tara)</h2>
                <p style="color: #94a3b8; font-size: 1.1rem;">Nimm das leere Fach aus dem Regal und stelle es auf die Waage.</p>

                <form method="POST" action="?/requestScale" use:enhance={() => {
                    wizardState = 'weigh_box_polling';
                    return async ({ result }) => {
                        if(result.data.success) {
                            requestId = result.data.requestId;
                            startPolling('box');
                        }
                    };
                }}>
                    <button type="submit" class="btn-primary huge-btn" style="margin-top: 2rem;">Waage starten</button>
                </form>

            {:else if wizardState === 'weigh_box_polling'}
                <div class="scale-animation">
                    <div class="spinner"></div>
                    <h2>Messe Leergewicht...</h2>
                    <p>Bitte das Fach ruhig auf der Waage stehen lassen.</p>
                </div>

            <!-- SCHRITT 3a: ABFRAGE (Nur wenn Stückgewicht schon bekannt) -->
            {:else if wizardState === 'ask_item_weight'}
                <div class="step-indicator">Schritt 3 von 3</div>
                <div style="font-size: 4rem; margin-bottom: 1rem;">⚖️</div>
                <h2 style="color: #22c55e;">Stückgewicht bekannt</h2>
                <p style="color: #94a3b8; font-size: 1.1rem;">In der Datenbank ist für diesen Artikel bereits ein Gewicht von <strong>{article.attributes.itemWeight} g</strong> pro Stück hinterlegt.</p>

                <div style="display: flex; flex-direction: column; gap: 1rem; margin-top: 2rem;">
                    <button type="button" class="btn-primary huge-btn" style="background: #22c55e;" on:click={() => {
                        itemWeight = parseFloat(article.attributes.itemWeight);
                        wizardState = 'summary';
                    }}>
                        ✅ Bekanntes Gewicht nutzen ({article.attributes.itemWeight} g)
                    </button>
                    <button type="button" class="btn-cancel" style="padding: 1rem; font-size: 1.1rem; width: 100%; border-radius: 12px;" on:click={() => wizardState = 'weigh_item'}>
                        🔄 Nein, Gewicht neu messen
                    </button>
                </div>

            <!-- SCHRITT 3b: ARTIKEL WIEGEN (Wenn neues Gewicht benötigt) -->
            {:else if wizardState === 'weigh_item'}
                <div class="step-indicator">Schritt 3 von 3</div>
                <div style="font-size: 4rem; margin-bottom: 1rem;">🔩</div>
                <h2 style="color: #22c55e;">3. Einzelgewicht ermitteln</h2>
                <p style="color: #94a3b8; font-size: 1.1rem;">Lege nun <strong>exakt 1 Stück</strong> des Artikels in das Fach auf der Waage.</p>

                <form method="POST" action="?/requestScale" use:enhance={() => {
                    wizardState = 'weigh_item_polling';
                    return async ({ result }) => {
                        if(result.data.success) {
                            requestId = result.data.requestId;
                            startPolling('item');
                        }
                    };
                }}>
                    <button type="submit" class="btn-primary huge-btn" style="margin-top: 2rem;">Waage starten</button>
                </form>

            {:else if wizardState === 'weigh_item_polling'}
                <div class="scale-animation">
                    <div class="spinner"></div>
                    <h2>Messe Gesamtgewicht...</h2>
                    <p>Berechne das Einzelgewicht des Artikels.</p>
                </div>

            <!-- SCHRITT 4: ZUSAMMENFASSUNG & SPEICHERN -->
            {:else if wizardState === 'summary'}
                <h2 style="color: #38bdf8; margin-bottom: 2rem;">Zusammenfassung</h2>
                
                <div class="stats-grid">
                    <div class="stat-box">
                        <span class="label">Barcode</span>
                        <span class="value" style="color: #f8fafc; font-size: 1.2rem;">{activeBarcode}</span>
                    </div>
                    <div class="stat-box">
                        <span class="label">Leeres Fach (Tara)</span>
                        <span class="value" style="color: #f59e0b;">{boxWeight} g</span>
                    </div>
                    <div class="stat-box">
                        <span class="label">Einzelgewicht</span>
                        <span class="value" style="color: #22c55e;">{itemWeight.toFixed(1)} g</span>
                    </div>
                </div>

                <form method="POST" action="?/saveAll" use:enhance={() => {
                    return async ({ update }) => {
                        await update();
                        await invalidateAll();
                        wizardState = 'success';
                        setTimeout(() => closeWizard(), 3000);
                    };
                }}>
                    <input type="hidden" name="articleId" value={article._id}>
                    <input type="hidden" name="barcode" value={activeBarcode}>
                    <input type="hidden" name="boxWeight" value={boxWeight}>
                    <input type="hidden" name="itemWeight" value={itemWeight.toFixed(1)}>
                    
                    <button type="submit" class="btn-primary huge-btn" style="margin-top: 2rem; background: #22c55e;">
                        Alles speichern & Verknüpfen
                    </button>
                    <button type="button" class="btn-cancel" style="margin-top: 1rem; width: 100%;" on:click={() => wizardState = 'scan'}>Abbrechen & Neu starten</button>
                </form>

            <!-- ERFOLG -->
            {:else if wizardState === 'success'}
                <div style="font-size: 5rem; margin-bottom: 1rem;">✅</div>
                <h2 style="color: #22c55e;">Setup abgeschlossen!</h2>
                <p style="color: #94a3b8;">Barcode und Gewichte wurden erfolgreich im Artikel hinterlegt.</p>
            {/if}
        </div>
    </div>
{/if}

<!-- ============================================== -->
<!-- KONFLIKT-MODAL (DOPPELBELEGUNG)                -->
<!-- ============================================== -->
{#if showConflictModal && conflictingArticle}
    <div class="modal-overlay">
        <div class="modal-content conflict-large-modal">
            <div class="modal-header" style="border-bottom: 1px solid #ef4444; padding-bottom: 1rem;">
                <h2 style="color: #ef4444; margin: 0;">⚠️ Doppelbelegung blockiert!</h2>
                <button class="btn-close-modal" on:click={() => { showConflictModal = false; openWizard(); }}>✕</button>
            </div>

            <!-- Fehlermeldung oben drüber -->
            <div class="warning-box" style="margin: 1.5rem 0;">
                <span class="warning-icon">❌</span>
                <div>
                    <h4>Der Barcode ist bereits vergeben</h4>
                    <p>Er ist aktuell fest dem Artikel <strong>{conflictingArticle.title}</strong> zugewiesen. Du musst die Zuweisung dort erst aufheben, bevor du ihn verwenden kannst.</p>
                </div>
            </div>

            {#if !showUnlinkConflictConfirmation}
                <div class="article-layout" style="text-align: left; margin-top: 1rem;">
                    <div class="left-column" style="flex: 0 0 250px;">
                        <div class="image-section" style="height: 220px;">
                            {#if conflictingArticle.imagePath}
                                <img src={conflictingArticle.imagePath} alt={conflictingArticle.title} class="main-image" >
                            {:else}
                                <div class="no-image-placeholder">Kein Bild</div>
                            {/if}
                        </div>
                        <button type="button" class="btn-danger" style="width: 100%; padding: 1rem; margin-top: 1rem;" on:click={() => showUnlinkConflictConfirmation = true}>
                            🗑️ Verknüpfung hier aufheben
                        </button>
                    </div>

                    <div class="info-section" style="max-height: 400px; overflow-y: auto; padding-right: 0.5rem;">
                        <h2 style="color: #38bdf8; margin: 0;">{conflictingArticle.title}</h2>
                        <p style="color: #94a3b8; font-family: monospace;">SKU: {conflictingArticle.sku || '-'}</p>
                        
                        {#if conflictingArticle.description}
                            <div class="description-box" style="margin-top: 1rem;">
                                <h3 style="font-size: 1.1rem; margin-bottom: 0.3rem;">Beschreibung</h3>
                                <p style="font-size: 0.95rem; color: #cbd5e1;">{conflictingArticle.description}</p>
                            </div>
                        {/if}

                        {#if conflictDisplayAttributes.length > 0}
                            <div class="specs-section" style="margin-top: 1.5rem;">
                                <h3 style="font-size: 1.1rem; margin-bottom: 0.5rem;">Spezifikationen</h3>
                                <div class="specs-grid">
                                    {#each conflictDisplayAttributes as attr}
                                        <div class="spec-row" style="font-size: 0.95rem; padding: 0.6rem 1rem;">
                                            <span class="spec-label">{attr.label}</span>
                                            <span class="spec-value">{attr.value}{attr.unit}</span>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </div>
                </div>
                
                <div class="button-row" style="margin-top: 2rem; justify-content: flex-end;">
                    <button type="button" class="btn-cancel" on:click={() => { showConflictModal = false; openWizard(); }}>Abbrechen & Zurück zum Scan</button>
                </div>
            {:else}
                <div style="padding: 2rem 1rem;">
                    <div class="warning-box" style="border-color: #ef4444; background: rgba(239, 68, 68, 0.15); margin-bottom: 2rem;">
                        <span class="warning-icon" style="font-size: 2.5rem;">⚠️</span>
                        <div>
                            <h3 style="color: #ef4444; margin: 0 0 0.5rem 0;">Bist du absolut sicher?</h3>
                            <p>Du löst gerade den Barcode vom Artikel <strong>{conflictingArticle.title}</strong> ab.</p>
                            <p style="margin-top: 0.5rem; font-weight: bold; color: #fca5a5;">Konsequenz: Dieser Artikel kann ab sofort physisch NICHT MEHR per Pick-by-Light im Regal aufleuchten!</p>
                        </div>
                    </div>

                    <form method="POST" action="?/unlinkBarcode" use:enhance={() => {
                        return async ({ update }) => {
                            await update();
                            await invalidateAll(); 
                            showUnlinkConflictConfirmation = false;
                            showConflictModal = false;
                            openWizard(); 
                        };
                    }}>
                        <input type="hidden" name="articleId" value={conflictingArticle._id} >

                        <div class="button-row">
                            <button type="button" class="btn-cancel" on:click={() => showUnlinkConflictConfirmation = false}>Abbrechen</button>
                            <button type="submit" class="btn-danger" style="font-size: 1.2rem; padding: 1rem 2rem;">Endgültig entfernen & Platz freigeben</button>
                        </div>
                    </form>
                </div>
            {/if}
        </div>
    </div>
{/if}

<!-- ============================================== -->
<!-- MODAL: LÖSCHEN AUS DER HAUPTANSICHT            -->
<!-- ============================================== -->
{#if showUnlinkConfirmation && !showModal}
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
                    <button type="button" class="btn-cancel" on:click={() => showUnlinkConfirmation = false}>Abbrechen</button>
                    <button type="submit" class="btn-danger">Endgültig entfernen</button>
                </div>
            </form>
        </div>
    </div>
{/if}

<style>
    /* Generelles Layout - Terminal Dark Mode */
    .terminal-page { max-width: 1400px; margin: 0 auto; padding: 1rem 2rem; color: #f8fafc; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; border-bottom: 1px solid #334155; padding-bottom: 1.5rem;}
    h1 { color: #22c55e; margin: 0; font-size: 2.5rem; }
    .btn-back { background: #1e293b; color: white; padding: 1rem 1.5rem; border-radius: 12px; border: 1px solid #475569; text-decoration: none; font-weight: bold; }
    
    .article-layout { display: flex; gap: 3rem; align-items: flex-start; }
    .left-column { flex: 0 0 450px; display: flex; flex-direction: column; gap: 1.5rem; position: sticky; top: 2rem; }
    .image-section { background: white; border-radius: 16px; height: 350px; display: flex; align-items: center; justify-content: center; }
    .main-image { max-width: 100%; max-height: 100%; object-fit: contain; }
    .no-image-placeholder { color: #94a3b8; font-size: 1.2rem; font-weight: bold; }
    
    .hardware-trigger-btn { background: #3b82f6; color: white; border: none; padding: 2rem; border-radius: 16px; font-size: 1.3rem; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 1rem; box-shadow: 0 8px 20px rgba(59, 130, 246, 0.25); transition: background 0.2s; }
    .hardware-trigger-btn:hover { background: #2563eb; }
    .btn-unlink-secondary { background: transparent; color: #ef4444; border: 2px dashed #ef4444; padding: 1.2rem; border-radius: 12px; font-weight: bold; cursor: pointer; font-size: 1.1rem; }
    
    .info-section { flex: 1; display: flex; flex-direction: column; gap: 1.5rem; }
    .drawer-highlight { background: rgba(59, 130, 246, 0.1); border: 2px solid #3b82f6; padding: 1.5rem; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; }
    .drawer-highlight .label { color: #93c5fd; font-weight: bold; text-transform: uppercase; font-size: 1.2rem; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; background: #1e293b; padding: 1.5rem; border-radius: 12px; border: 1px solid #334155; }
    .meta-item { display: flex; flex-direction: column; gap: 0.5rem; }
    .meta-label { color: #94a3b8; font-size: 0.9rem; text-transform: uppercase; font-weight: bold; }
    .meta-value { font-size: 1.2rem; font-weight: bold; color: white; }

    /* Modals & Wizard */
    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 1000; display: flex; justify-content: center; align-items: center; }
    .modal-backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 1000; }
    .modal-window, .modal-content { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #1e293b; border: 1px solid #475569; border-radius: 16px; z-index: 1001; }
    .scan-modal { width: 90%; max-width: 600px; }
    .conflict-large-modal { position: relative; top: auto; left: auto; transform: none; width: 95%; max-width: 900px; max-height: 90vh; overflow-y: auto; }
    
    .modal-header { display: flex; justify-content: space-between; padding: 1.5rem; border-bottom: 1px solid #334155; }
    .modal-header h3 { margin: 0; color: white; font-size: 1.2rem; }
    .btn-close-modal { background: none; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer; }
    
    .step-indicator { display: inline-block; background: #334155; color: #cbd5e1; padding: 0.4rem 1rem; border-radius: 20px; font-weight: bold; font-size: 0.9rem; margin-bottom: 1.5rem; }
    .hidden-scan-input { opacity: 0; position: absolute; height: 1px; width: 1px; z-index: -1; }
    
    .huge-btn { width: 100%; padding: 1.5rem; font-size: 1.2rem; border-radius: 12px; font-weight: bold; cursor: pointer; border: none; color: white; background: #3b82f6; transition: background 0.2s; }
    .huge-btn:hover { background: #2563eb; }
    .btn-cancel { background: transparent; border: 1px solid #475569; color: #94a3b8; padding: 1rem; border-radius: 8px; font-weight: bold; cursor: pointer; }
    .btn-primary { background: #3b82f6; color: white; border: none; padding: 1rem 2rem; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 1.1rem; }
    .btn-danger { background: #ef4444; color: white; border: none; padding: 1rem 2rem; border-radius: 8px; font-weight: bold; cursor: pointer; }
    
    .button-row { display: flex; gap: 1rem; justify-content: center; }

    /* Warnings & Alerts */
    .warning-box { background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; border-radius: 8px; padding: 1.5rem; display: flex; align-items: flex-start; gap: 1rem; text-align: left; }
    .warning-icon { font-size: 2rem; line-height: 1; }
    .warning-box h4 { margin: 0 0 0.5rem 0; color: #ef4444; font-size: 1.2rem; }
    .warning-box p { margin: 0; color: #cbd5e1; font-size: 1.1rem; line-height: 1.4; }
    
    /* Waage-Animation */
    .scale-animation { padding: 3rem 2rem; background: rgba(59, 130, 246, 0.1); border-radius: 12px; border: 1px dashed #3b82f6; margin-top: 1.5rem; }
    .spinner { width: 50px; height: 50px; border: 5px solid #334155; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1.5rem auto; }
    
    /* Summary Grid */
    .stats-grid { display: flex; justify-content: center; gap: 1rem; margin-bottom: 2rem; }
    .stat-box { flex: 1; display: flex; flex-direction: column; background: #0f172a; padding: 1rem; border-radius: 8px; border: 1px solid #334155; }
    .stat-box .label { color: #94a3b8; font-size: 0.8rem; text-transform: uppercase; margin-bottom: 0.5rem; }
    .stat-box .value { font-size: 1.5rem; font-weight: bold; }

    /* Spezifikationen im Konflikt-Modal */
    .specs-grid { display: flex; flex-direction: column; background: #0f172a; border-radius: 8px; border: 1px solid #334155; overflow: hidden; }
    .spec-row { display: flex; border-bottom: 1px solid #334155; }
    .spec-row:last-child { border-bottom: none; }
    .spec-label { width: 40%; color: #94a3b8; font-weight: 600; }
    .spec-value { color: #f8fafc; font-weight: 600; }

    @keyframes spin { to { transform: rotate(360deg); } }
</style>