<script>
    import CameraScan from '$lib/components/CameraScan.svelte';
    import TerminalHeader from '$lib/components/TerminalHeader.svelte';
    import { enhance } from '$app/forms';
    import { invalidateAll, beforeNavigate } from '$app/navigation';
    import { onDestroy } from 'svelte';
    import { nextFreeLed, shelfTerminalId } from '$lib/terminals.js';

    export let data;
    $: shelves = data?.shelves || [];

    // --- Mehrere Terminals: jedes Regal hängt am LED-Streifen eines Terminals ---
    $: terminals = data?.terminals || [];
    $: multi = terminals.length > 1;
    let chosenSetupTerminal = null;   // Terminal für ein neues Regal
    $: setupTerminalId = terminals.some((t) => t.id === chosenSetupTerminal) ? chosenSetupTerminal : (data?.currentTerminalId || terminals[0]?.id || null);
    // Die LED-Nummern zählen pro Terminal-Streifen
    $: nextFree = nextFreeLed(shelves, setupTerminalId, terminals);
    const terminalName = (id) => terminals.find((t) => t.id === id)?.name || 'Terminal';
    const start = (s) => parseInt(s.start_index) || 0;
    const end = (s) => start(s) + (parseInt(s.drawer_count) || 0);
    // Regale, deren LED-Bereich sich am selben Terminal mit einem anderen überschneidet
    $: overlapping = new Set(shelves.filter((a) => shelves.some((b) => b._id !== a._id
        && shelfTerminalId(a, terminals) === shelfTerminalId(b, terminals) && start(a) < end(b) && start(b) < end(a))).map((s) => s._id));

    // Welches Terminal ist gerade betroffen? Beim Bearbeiten eines Fachs das seines Regals, beim Anlernen das gewählte
    function ledTarget(formData) {
        if (editingDrawer) formData.append('shelfId', editingDrawer.shelfId);
        else if (setupTerminalId) formData.append('terminalId', setupTerminalId);
        return formData;
    }
    
    // --- State-Machine für die Hauptansichten ---
    let currentView = 'dashboard'; 
    
    // --- Variablen für das Anlernen eines neuen Regals ---
    let newShelfName = ''; 
    let currentLedIndex = 0;
    let scannedBarcodes = []; 
    let currentScanInput = '';
    let scanInputRef; 
    let ledTriggered = false; 
    let scanError = ''; // 🔥 NEU: Speicher für Scan-Fehlermeldungen

    // --- State für aufklappbare Detailansicht ---
    let expandedShelfId = null;

    // --- State für das Bearbeiten eines einzelnen Fachs (Modal) ---
    let editingDrawer = null; 
    let editScanInput = '';
    let editInputRef;
    let showOverwriteWarning = false;

    // --- State für das Löschen eines Regals (Modal) ---
    let shelfToDelete = null;

    // --- SICHERHEITSNETZ: Globale Abbruch-Funktion für die Hardware ---
    async function stopHardware() {
        try {
            const formData = ledTarget(new FormData());
            await fetch('?/cancelCalibration', {
                method: 'POST',
                body: formData
            });
        } catch (error) {
            console.error("Fehler beim Stoppen der Hardware:", error);
        }
    }

    beforeNavigate(() => { stopHardware(); });

    onDestroy(() => {
        if (typeof window !== 'undefined') {
            stopHardware();
        }
    });

    async function closeEditModal() {
        editingDrawer = null;
        showOverwriteWarning = false;
        await stopHardware();
    }

    function toggleShelf(id) {
        if (expandedShelfId === id) {
            expandedShelfId = null;
        } else {
            expandedShelfId = id;
        }
    }

    async function startCalibration() {
        currentView = 'calibration';
        scannedBarcodes = [];
        scanError = ''; 
        currentLedIndex = nextFree;
        
        // 🔥 FIX: Sicherstellen, dass alle LEDs aus sind, bevor wir starten
        await stopHardware();
        await new Promise(resolve => setTimeout(resolve, 200));

        await triggerLed(currentLedIndex);
        setTimeout(() => scanInputRef?.focus(), 100);
    }

    async function startEditDrawer(shelfId, ledIndex, currentBarcode) {
        editingDrawer = { shelfId, ledIndex, currentBarcode };
        editScanInput = '';
        showOverwriteWarning = false; 
        
        // 🔥 FIX: Alte LEDs ausschalten, bevor das zu bearbeitende Fach leuchtet
        await stopHardware();
        await new Promise(resolve => setTimeout(resolve, 200));

        await triggerLed(ledIndex);
        setTimeout(() => editInputRef?.focus(), 100);
    }

    async function triggerLed(index) {
        ledTriggered = true;
        const formData = ledTarget(new FormData());
        formData.append('ledIndex', index);
        
        await fetch('?/triggerCalibrationLED', {
            method: 'POST',
            body: formData
        });
        
        setTimeout(() => { ledTriggered = false; }, 1000);
    }

    // 🔥 NEU: Die intelligente Validierung beim Scannen
    async function handleScanSubmit() {
        const barcode = currentScanInput.trim();
        if (!barcode) return;

        scanError = ''; 

        // 1. Lokale Prüfung 
        if (scannedBarcodes.some(b => b.barcode === barcode)) {
            scanError = `Der Barcode '${barcode}' wurde in dieser Sitzung bereits erfasst!`;
            currentScanInput = '';
            setTimeout(() => scanInputRef?.focus(), 100);
            return; 
        }

        // 2. Globale Prüfung 
        let duplicateShelfName = null;
        for (const shelf of shelves) {
            if (shelf.drawers && shelf.drawers.some(d => d.barcode === barcode)) {
                duplicateShelfName = shelf.name;
                break;
            }
        }

        if (duplicateShelfName) {
            scanError = `Der Barcode '${barcode}' ist bereits im Regal '${duplicateShelfName}' vergeben!`;
            currentScanInput = '';
            setTimeout(() => scanInputRef?.focus(), 100);
            return; 
        }

        // Wenn kein Fehler gefunden wurde -> Normal fortfahren!
        scannedBarcodes = [...scannedBarcodes, { 
            ledIndex: currentLedIndex, 
            barcode: barcode 
        }];
        
        currentScanInput = '';

        // 🔥 FIX: Bevor wir zum nächsten Fach springen, schalten wir alle alten LEDs aus!
        await stopHardware();
        // Ein winziger Moment Pause, damit der Raspberry Pi den Aus-Befehl zuerst verarbeitet
        await new Promise(resolve => setTimeout(resolve, 200));

        currentLedIndex++;
        await triggerLed(currentLedIndex);
        scanInputRef?.focus();
    }

    async function undoLastScan() {
        if (scannedBarcodes.length === 0) return;

        // 1. Letztes Element entfernen
        scannedBarcodes = scannedBarcodes.slice(0, -1);
        
        // 2. LED-Index verringern
        const startIndex = nextFree;
        if (currentLedIndex > startIndex) {
            currentLedIndex--;
        }

        // 3. Fehler ausblenden
        scanError = ''; 
        currentScanInput = '';

        // 🔥 FIX: Auch beim Zurückgehen zuerst die aktuelle LED ausschalten
        await stopHardware();
        await new Promise(resolve => setTimeout(resolve, 200));

        await triggerLed(currentLedIndex);
        setTimeout(() => scanInputRef?.focus(), 100);
    }

    function focusOnInit(node) {
        node.focus();
        return { destroy() {} };
    }
</script>

<div class="terminal-page space-grotesk">
    <TerminalHeader title="Fächer anlernen" subtitle="Verwalte deine Sortimentskästen und lerne neue Fächer an." backHref="/terminal/settings" />

    {#if currentView === 'dashboard'}
        <div class="dashboard-grid">
            {#each shelves as shelf}
                <div class="shelf-card">
                    <div class="shelf-header clickable" on:click={() => toggleShelf(shelf._id)}>
                        <div class="shelf-title">
                            <span class="icon">🗄️</span>
                            <h2>{shelf.name}</h2>
                        </div>
                        <span class="chevron">{expandedShelfId === shelf._id ? '▲' : '▼'}</span>
                    </div>
                    
                    <div class="shelf-stats">
                        <div class="stat">
                            <span class="label">Fächeranzahl</span>
                            <span class="value">{shelf.drawer_count}</span>
                        </div>
                        <div class="stat">
                            <span class="label">LED Indizes</span>
                            <span class="value">#{shelf.start_index} - #{parseInt(shelf.start_index) + parseInt(shelf.drawer_count) - 1}</span>
                        </div>
                        {#if multi}
                            <div class="stat">
                                <span class="label">Terminal</span>
                                <span class="value">{terminalName(shelfTerminalId(shelf, terminals))}</span>
                            </div>
                        {/if}
                    </div>
                    {#if overlapping.has(shelf._id)}
                        <p class="overlap-warning">⚠️ Der LED-Bereich überschneidet sich mit einem anderen Regal am selben Terminal.</p>
                    {/if}

                    {#if expandedShelfId === shelf._id}
                        <div class="shelf-details">
                            <h3>Zugeordnete Barcodes</h3>
                            <div class="drawers-list">
                                {#each shelf.drawers || [] as drawer}
                                    <div class="drawer-list-item">
                                        <div class="drawer-info">
                                            <span class="led-badge">LED #{drawer.ledIndex}</span>
                                            <span class="barcode-text"><small>Barcode:</small> {drawer.barcode}</span>
                                        </div>
                                        <button class="btn-edit-small" on:click={() => startEditDrawer(shelf._id, drawer.ledIndex, drawer.barcode)}>
                                            Barcode ändern
                                        </button>
                                    </div>
                                {/each}
                                {#if !shelf.drawers || shelf.drawers.length === 0}
                                    <p class="empty-state">Keine Fächer registriert.</p>
                                {/if}
                            </div>
                            
                            {#if multi}
                                <form method="POST" action="?/setShelfTerminal" class="terminal-assign" use:enhance={() => async ({ update }) => { await update(); await invalidateAll(); }}>
                                    <input type="hidden" name="shelfId" value={shelf._id} >
                                    <label>
                                        <span>An welchem Terminal hängt dieses Regal?</span>
                                        <select name="terminalId" class="terminal-select" value={shelfTerminalId(shelf, terminals)} on:change={(e) => e.currentTarget.form.requestSubmit()}>
                                            {#each terminals as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
                                        </select>
                                    </label>
                                </form>
                            {/if}

                            <div class="shelf-actions">
                                <button class="btn-cancel-calibration" style="width: auto; padding: 0.5rem 1rem; font-size: 0.9rem;" on:click={() => shelfToDelete = shelf}>
                                    Regal löschen
                                </button>
                            </div>
                        </div>
                    {/if}
                </div>
            {/each}

            <button class="add-shelf-btn" on:click={() => {
                newShelfName = `Regal ${shelves.length + 1}`;
                chosenSetupTerminal = data?.currentTerminalId || terminals[0]?.id || null;
                currentView = 'setup';
            }}>
                <span class="plus-icon">+</span>
                <span>Neues Regal hinzufügen</span>
                <small>(Plug & Play)</small>
            </button>
        </div>
    {/if}

    {#if currentView === 'setup'}
        <div class="setup-container">
            <h2>Neues Regal benennen</h2>
            {#if multi}
                <label class="setup-terminal">
                    <span>An welchem Terminal wird das Regal angeschlossen?</span>
                    <select class="terminal-select" bind:value={chosenSetupTerminal}>
                        {#each terminals as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
                    </select>
                </label>
            {/if}
            <p>Das neue Regal wird ab <strong>LED #{nextFree}</strong>{multi ? ` am Streifen von „${terminalName(setupTerminalId)}“` : ''} angelernt. Bitte stecke das Datenkabel des neuen Kastens in den Ausgang (DOUT) des vorherigen.</p>
            
            <input type="text" class="terminal-input" bind:value={newShelfName} placeholder="z.B. Kleinteile Links" >
            
            <div class="button-row">
                <button class="btn-cancel" on:click={() => {
                    currentView = 'dashboard';
                    stopHardware();
                }}>Zurück</button>
                <button class="btn-primary" on:click={startCalibration}>Anlernen starten</button>
            </div>
        </div>
    {/if}

    {#if currentView === 'calibration'}
        <div class="calibration-container" on:click={() => scanInputRef?.focus()}>
            
            <div class="active-led-display" class:pulse={ledTriggered}>
                <div class="led-indicator"></div>
                <h2>LED #{currentLedIndex} leuchtet</h2>
                <p>Bitte scanne den Barcode, welcher sich bei der LED befindet.</p>
                <p>Sobald alle Fächer des Regals gescannt wurden, bitte "Erfassung beenden und Speichern" anwählen.</p>
            </div>

            <!-- 🔥 NEU: Die Fehlermeldung bei Duplikaten -->
            {#if scanError}
                <div class="warning-box error-box" style="margin-bottom: 1.5rem;">
                    <span class="warning-icon">❌</span>
                    <div>
                        <h4 style="margin-bottom: 0.3rem;">Doppelter Barcode</h4>
                        <p>{scanError}</p>
                    </div>
                </div>
            {/if}

            <form on:submit|preventDefault={handleScanSubmit} class="scan-form">
                <input 
                    bind:this={scanInputRef}
                    bind:value={currentScanInput}
                    type="text" 
                    class="terminal-input scan-input"
                    placeholder="Warte auf Barcode-Scanner..." 
                    use:focusOnInit 
                >
                <button type="submit" class="btn-hidden">Scan</button>
            </form>
            <CameraScan input={scanInputRef} label="📷 Fach mit Kamera scannen" />

            <div class="scanned-list">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3 style="margin: 0;">Bisher erfasst ({scannedBarcodes.length} Fächer):</h3>
                    
                    {#if scannedBarcodes.length > 0}
                        <button type="button" class="btn-undo-scan" on:click={undoLastScan}>
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="9 14 4 9 9 4"></polyline>
                                <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
                            </svg>
                            Letzten Scan rückgängig
                        </button>
                    {/if}
                </div>

                <div class="tags">
                    {#each scannedBarcodes as item}
                        <span class="scan-tag">#{item.ledIndex}: {item.barcode}</span>
                    {/each}
                    {#if scannedBarcodes.length === 0}
                        <span class="empty-state">Noch keine Fächer gescannt.</span>
                    {/if}
                </div>
            </div>

            <div class="action-buttons-column">
                <form method="POST" action="?/saveNewShelf" use:enhance={() => {
                    return async ({ update }) => {
                        await update();
                        await invalidateAll(); 
                        currentView = 'dashboard';
                    };
                }}>
                    <input type="hidden" name="shelfName" value={newShelfName} >
                    <input type="hidden" name="startIndex" value={nextFree} >
                    {#if setupTerminalId}<input type="hidden" name="terminalId" value={setupTerminalId} >{/if}
                    <input type="hidden" name="drawerCount" value={scannedBarcodes.length} > 
                    <input type="hidden" name="barcodes" value={JSON.stringify(scannedBarcodes)} >
                    
                    <button type="submit" class="btn-finish" disabled={scannedBarcodes.length === 0}>
                        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        Erfassung beenden & Speichern
                    </button>
                </form>

                <button type="button" class="btn-cancel-calibration" on:click={async () => {
                    currentView = 'dashboard';
                    await stopHardware();
                }}>
                    Erfassung abbrechen
                </button>
            </div>
            
        </div>
    {/if}

    {#if editingDrawer}
        <div class="modal-overlay" on:click={() => editInputRef?.focus()}>
            <div class="modal-content" on:click|stopPropagation>
                <h2>Barcode neu zuweisen</h2>
                
                <div class="active-led-display pulse">
                    <div class="led-indicator" style="width: 40px; height: 40px;"></div>
                    <h3>LED #{editingDrawer.ledIndex} leuchtet</h3>
                </div>

                <form method="POST" action="?/updateBarcode" use:enhance={({ cancel }) => {
                    if (!showOverwriteWarning) {
                        cancel();
                        if (editScanInput.trim() !== '') {
                            showOverwriteWarning = true;
                        }
                        return;
                    }
                    
                    return async ({ update }) => {
                        await update();
                        await invalidateAll(); 
                        editingDrawer = null; 
                        showOverwriteWarning = false;
                    };
                }}>
                    <input type="hidden" name="shelfId" value={editingDrawer.shelfId} >
                    <input type="hidden" name="ledIndex" value={editingDrawer.ledIndex} >
                    
                    {#if !showOverwriteWarning}
                        <p style="text-align: left; margin-bottom: 0.5rem; color: #94a3b8;">Aktueller Barcode: {editingDrawer.currentBarcode}</p>
                        <input 
                            bind:this={editInputRef}
                            bind:value={editScanInput}
                            type="text" 
                            name="newBarcode" 
                            class="terminal-input scan-input"
                            placeholder="Neuen Barcode scannen..." 
                            required
                            use:focusOnInit 
                        >

                        <div class="button-row" style="margin-top: 2rem;">
                            <button type="button" class="btn-cancel" on:click={closeEditModal}>
                                Abbrechen
                            </button>
                            <button type="submit" class="btn-primary">Überschreiben</button>
                        </div>
                    {:else}
                        <div class="warning-box">
                            <span class="warning-icon">⚠️</span>
                            <div>
                                <h4>Achtung: Physische Zuordnung wird geändert!</h4>
                                <p>Die feste Pick-by-Light Zuordnung geht für den alten Barcode ({editingDrawer.currentBarcode}) verloren.</p>
                                <p style="margin-top: 0.5rem;">Fach <strong>LED #{editingDrawer.ledIndex}</strong> wird nun fest mit <strong class="highlight-code">{editScanInput}</strong> verknüpft.</p>
                            </div>
                        </div>
                        
                        <input type="hidden" name="newBarcode" value={editScanInput} >

                        <div class="button-row" style="margin-top: 2rem;">
                            <button type="button" class="btn-cancel" on:click={() => {
                                showOverwriteWarning = false;
                                setTimeout(() => editInputRef?.focus(), 100);
                            }}>
                                Zurück
                            </button>
                            <button type="submit" class="btn-danger">Endgültig überschreiben</button>
                        </div>
                    {/if}
                </form>
            </div>
        </div>
    {/if}

    {#if shelfToDelete}
        <div class="modal-overlay" on:click={() => shelfToDelete = null}>
            <div class="modal-content" on:click|stopPropagation>
                <h2>Regal wirklich löschen?</h2>
                
                <div class="warning-box">
                    <span class="warning-icon">⚠️</span>
                    <div>
                        <h4>Achtung!</h4>
                        <p><strong>{shelfToDelete.name}</strong> und alle darin verknüpften Barcodes werden unwiderruflich aus dem System entfernt.</p>
                    </div>
                </div>

                <form method="POST" action="?/deleteShelf" use:enhance={() => {
                    return async ({ update }) => {
                        await update();
                        await invalidateAll(); 
                        shelfToDelete = null;
                        expandedShelfId = null; 
                    };
                }}>
                    <input type="hidden" name="shelfId" value={shelfToDelete._id} >

                    <div class="button-row" style="margin-top: 2rem;">
                        <button type="button" class="btn-cancel" on:click={() => shelfToDelete = null}>
                            Abbrechen
                        </button>
                        <button type="submit" class="btn-danger">Endgültig löschen</button>
                    </div>
                </form>
            </div>
        </div>
    {/if}
</div>

<style>
    /* Generelles Layout */
    .terminal-page { max-width: 1400px; margin: 0 auto; color: #f8fafc; }

    /* Mehrere Terminals */
    .overlap-warning { margin: -0.5rem 0 1rem 0; color: #fcd34d; font-weight: 600; font-size: 0.95rem; }
    .terminal-assign { margin: 0 0 1.25rem 0; }
    .terminal-assign label, .setup-terminal { display: flex; flex-direction: column; gap: 0.5rem; color: #94a3b8; font-weight: 600; }
    .setup-terminal { margin-bottom: 1.25rem; text-align: left; }
    .terminal-select { padding: 0.8rem 1rem; border-radius: 10px; border: 2px solid #334155; background: #0f172a; color: #f8fafc; font-size: 1.05rem; font-family: inherit; }
    .terminal-select:focus { border-color: #3b82f6; outline: none; }

    /* Dashboard & Regale */
    .dashboard-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 2rem; align-items: start; }
    .shelf-card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 1.5rem; transition: all 0.3s ease; }
    
    .shelf-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
    .shelf-header.clickable { cursor: pointer; padding: 0.5rem; border-radius: 8px; transition: background 0.2s; }
    .shelf-header.clickable:hover { background: rgba(255,255,255,0.05); }
    .shelf-title { display: flex; align-items: center; gap: 1rem; }
    .shelf-title .icon { font-size: 2rem; }
    .shelf-title h2 { margin: 0; color: #f8fafc; font-size: 1.5rem; }
    .chevron { color: #94a3b8; font-size: 1.2rem; }
    
    .shelf-stats { display: flex; flex-direction: column; gap: 1rem; background: #0f172a; padding: 1rem; border-radius: 8px; }
    .stat { display: flex; justify-content: space-between; align-items: center; }
    .stat .label { color: #94a3b8; font-size: 0.9rem; text-transform: uppercase; font-weight: bold; }
    .stat .value { color: #38bdf8; font-weight: bold; font-size: 1.1rem; }

    /* Listen-Design für Fächer & Löschen-Sektion */
    .shelf-details { margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px dashed #334155; animation: slideDown 0.3s ease-out; }
    .shelf-details h3 { color: #94a3b8; font-size: 1rem; margin: 0 0 1rem 0; text-transform: uppercase; }
    
    .drawers-list { display: flex; flex-direction: column; gap: 0.8rem; }
    .drawer-list-item { 
        background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 1rem; 
        display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;
    }
    .drawer-list-item:hover { background: #1e293b; }
    .drawer-info { display: flex; align-items: center; gap: 1rem; }
    
    .led-badge { background: #22c55e; color: #000; font-size: 0.8rem; font-weight: bold; padding: 0.3rem 0.6rem; border-radius: 4px; }
    .barcode-text { font-family: monospace; font-size: 1.1rem; color: #f8fafc; }
    .barcode-text small { color: #94a3b8; font-family: sans-serif; font-size: 0.85rem; margin-right: 0.3rem; }
    
    .btn-edit-small { 
        background: rgba(56, 189, 248, 0.1); color: #38bdf8; border: 1px solid #38bdf8; 
        padding: 0.5rem 1rem; border-radius: 6px; font-weight: bold; font-size: 0.9rem; 
        cursor: pointer; transition: all 0.2s; white-space: nowrap;
    }
    .btn-edit-small:hover { background: #38bdf8; color: #0f172a; }

    .shelf-actions { margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid #334155; text-align: right; }
    
    @keyframes slideDown {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    /* Setup & Kalibrierung Container */
    .add-shelf-btn {
        background: rgba(34, 197, 94, 0.1); border: 2px dashed #22c55e; color: #22c55e;
        border-radius: 16px; padding: 2rem; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 0.5rem; cursor: pointer; transition: all 0.2s; height: 100%; min-height: 200px;
    }
    .add-shelf-btn:hover { background: rgba(34, 197, 94, 0.2); transform: translateY(-2px); }
    .add-shelf-btn .plus-icon { font-size: 3rem; line-height: 1; }
    .add-shelf-btn span { font-size: 1.2rem; font-weight: bold; }

    .setup-container, .calibration-container {
        background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 3rem;
        max-width: 600px; margin: 0 auto; text-align: center;
    }

    /* Inputs & Buttons */
    .terminal-input {
        width: 100%; background: #0f172a; border: 2px solid #334155; color: white;
        padding: 1rem 1.5rem; font-size: 1.2rem; border-radius: 12px; margin: 2rem 0;
        box-sizing: border-box; text-align: center;
    }
    .terminal-input:focus { outline: none; border-color: #38bdf8; box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2); }

    .button-row { display: flex; gap: 1rem; justify-content: center; }
    .btn-cancel { background: #334155; color: white; border: none; padding: 1rem 2rem; border-radius: 8px; font-weight: bold; cursor: pointer; transition: background 0.2s; }
    .btn-cancel:hover { background: #475569; }
    .btn-primary { background: #38bdf8; color: white; border: none; padding: 1rem 2rem; border-radius: 8px; font-weight: bold; cursor: pointer; transition: background 0.2s; }
    .btn-primary:hover { background: #0ea5e9; }
    .btn-danger { background: #ef4444; color: white; border: none; padding: 1rem 2rem; border-radius: 8px; font-weight: bold; cursor: pointer; transition: background 0.2s; }
    .btn-danger:hover { background: #dc2626; }

    /* Blinker Animation */
    .active-led-display { margin-bottom: 2rem; }
    .led-indicator {
        width: 60px; height: 60px; background: #22c55e; border-radius: 50%;
        margin: 0 auto 1.5rem auto; box-shadow: 0 0 30px #22c55e;
    }
    .pulse .led-indicator { animation: flash 1s ease-out; }
    @keyframes flash {
        0% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.2); opacity: 0.8; box-shadow: 0 0 50px #22c55e, 0 0 100px #22c55e; }
        100% { transform: scale(1); opacity: 1; }
    }

    .btn-hidden { display: none; }

    /* Tags Liste */
    .scanned-list { background: #0f172a; padding: 1.5rem; border-radius: 12px; margin-bottom: 2rem; text-align: left; }
    .scanned-list h3 { color: #94a3b8; font-size: 1rem; margin-top: 0; }
    .tags { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .scan-tag { background: #334155; color: #f8fafc; padding: 0.4rem 0.8rem; border-radius: 6px; font-family: monospace; font-size: 1.1rem; }
    .empty-state { color: #475569; font-style: italic; }

    /* Undo Button Styles */
    .btn-undo-scan {
        display: flex; align-items: center; gap: 0.4rem;
        background: transparent; color: #f59e0b; border: 1px dashed #f59e0b;
        padding: 0.3rem 0.6rem; border-radius: 6px; font-size: 0.85rem; font-weight: bold;
        cursor: pointer; transition: all 0.2s;
    }
    .btn-undo-scan:hover {
        background: rgba(245, 158, 11, 0.1); border-style: solid;
    }

    /* Actions Column (Speichern/Abbrechen) */
    .action-buttons-column { display: flex; flex-direction: column; gap: 1rem; }
    .btn-finish {
        width: 100%; background: #22c55e; color: white; border: none; padding: 1.5rem;
        border-radius: 12px; font-size: 1.3rem; font-weight: bold; cursor: pointer;
        display: flex; align-items: center; justify-content: center; gap: 1rem; transition: background 0.2s;
    }
    .btn-finish:hover:not(:disabled) { background: #16a34a; }
    .btn-finish:disabled { background: #334155; color: #94a3b8; cursor: not-allowed; }
    
    .btn-cancel-calibration {
        width: 100%; background: transparent; color: #ef4444; border: 2px solid #ef4444; 
        padding: 1rem; border-radius: 12px; font-size: 1.1rem; font-weight: bold; 
        cursor: pointer; transition: all 0.2s;
    }
    .btn-cancel-calibration:hover { background: rgba(239, 68, 68, 0.1); }

    /* Modals & Warnung */
    .modal-overlay {
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .modal-content {
        background: #1e293b; border: 1px solid #334155; border-radius: 16px;
        padding: 2.5rem; width: 90%; max-width: 550px; text-align: center;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .modal-content h2 { margin-top: 0; color: #f8fafc; }
    
    .warning-box {
        background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; border-radius: 8px;
        padding: 1rem; display: flex; align-items: flex-start; gap: 1rem; text-align: left;
        margin-top: 1rem;
    }
    .error-box { border-color: #ef4444; background: rgba(239, 68, 68, 0.1); }
    .warning-icon { font-size: 1.5rem; line-height: 1; }
    .warning-box h4 { margin: 0 0 0.5rem 0; color: #ef4444; }
    .warning-box p { margin: 0; color: #cbd5e1; font-size: 0.95rem; line-height: 1.4; }
    .highlight-code { color: #f8fafc; background: #334155; padding: 0.1rem 0.4rem; border-radius: 4px; font-family: monospace; }

    /* ===== Smartphone ===== */
    @media (max-width: 640px) {
        .dashboard-grid { grid-template-columns: 1fr; gap: 1rem; }
        .shelf-card { padding: 1rem; }
        .shelf-title h2 { font-size: 1.2rem; }
        .shelf-title .icon { font-size: 1.5rem; }
        .add-shelf-btn .plus-icon { font-size: 2rem; }
        .add-shelf-btn span { font-size: 1.05rem; }
        .setup-container, .calibration-container { padding: 1.25rem; }
        .button-row { flex-direction: column; }
        .btn-cancel, .btn-primary, .btn-danger { width: 100%; padding: 0.9rem; }
        .barcode-text { font-size: 1rem; overflow-wrap: anywhere; }
        .modal-content, .modal-window { width: calc(100% - 1rem); max-height: 92dvh; overflow-y: auto; }
        /* Ohne Hardware-Scanner: Absende-Button für die Eingabe von Hand zeigen */
        .btn-hidden {
            display: block; width: 100%; margin-top: 0.75rem; background: #3b82f6; color: white; border: none;
            border-radius: 10px; padding: 0.9rem; font-size: 1.05rem; font-weight: bold; cursor: pointer;
        }
    }
</style>