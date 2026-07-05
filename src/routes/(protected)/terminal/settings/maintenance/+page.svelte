<script>
    import { enhance } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    import { onDestroy } from 'svelte';
    
    export let data;
    
    $: articles = data.articles || [];
    
    let filterValue = 'all';
    
    const filterOptions = [
        { label: 'Alle anzeigen', value: 'all' },
        { label: 'Älter als 1 Stunde', value: 1 },
        { label: 'Älter als 3 Stunden', value: 3 },
        { label: 'Älter als 6 Stunden', value: 6 },
        { label: 'Älter als 12 Stunden', value: 12 },
        { label: 'Älter als 1 Tag', value: 24 },
        { label: 'Älter als 3 Tage', value: 72 },
        { label: 'Älter als 7 Tage', value: 168 },
        { label: 'Älter als 14 Tage', value: 336 },
        { label: 'Älter als 30 Tage', value: 720 }
    ];

    function getSlotStatus(article, barcode) {
        let slot = null;
        if (Array.isArray(article.assigned_barcodes)) {
            slot = article.assigned_barcodes.find(b => typeof b === 'object' && b.barcode === barcode);
        }

        // 🔥 KORREKTUR: Fächer dürfen nicht mehr den Zeitstempel des Hauptartikels klauen, wenn sie noch nie einzeln gewogen wurden!
        let tWeighed = 0;
        if (slot) {
            tWeighed = slot.lastWeighedAt ? new Date(slot.lastWeighedAt).getTime() : 0;
        } else {
            tWeighed = article.lastWeighedAt ? new Date(article.lastWeighedAt).getTime() : 0;
        }

        const tPicked = article.lastPickedAt ? new Date(article.lastPickedAt).getTime() : 0;
        const tReturned = article.lastReturnedAt ? new Date(article.lastReturnedAt).getTime() : 0;

        const tMovement = Math.max(tPicked, tReturned);
        const isDirty = tMovement > tWeighed;
        
        const hoursSinceMovement = (Date.now() - tMovement) / (1000 * 60 * 60);

        return { isDirty, hoursSinceMovement, tMovement };
    }

    $: filterHours = filterValue === 'all' ? 0 : parseFloat(filterValue);
    
    $: filteredArticles = articles.filter(a => {
        const slots = getBarcodes(a);
        if (slots.length === 0) return false;

        return slots.some(barcode => {
            const status = getSlotStatus(a, barcode);
            if (!status.isDirty) return false;
            if (filterValue === 'all') return true;
            return status.hoursSinceMovement >= filterHours;
        });
    }).sort((a, b) => {
        const tMoveA = Math.max(
            a.lastPickedAt ? new Date(a.lastPickedAt).getTime() : 0,
            a.lastReturnedAt ? new Date(a.lastReturnedAt).getTime() : 0
        );
        const tMoveB = Math.max(
            b.lastPickedAt ? new Date(b.lastPickedAt).getTime() : 0,
            b.lastReturnedAt ? new Date(b.lastReturnedAt).getTime() : 0
        );
        return tMoveA - tMoveB; 
    });

    function getBarcodes(article) {
        if (Array.isArray(article.assigned_barcodes) && article.assigned_barcodes.length > 0) {
            return article.assigned_barcodes.map(b => typeof b === 'object' ? b.barcode : b);
        } else if (article.assigned_barcode) {
            return [article.assigned_barcode];
        }
        return [];
    }

    function formatDate(dateString) {
        if (!dateString) return 'Noch nie';
        return new Date(dateString).toLocaleString('de-CH', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    let showModal = false;
    let wizardState = ''; 
    let modalError = '';
    let selectedArticle = null;
    let activeBarcode = '';
    let currentBoxWeight = 0;
    let requestId = null;
    let pollInterval = null;
    let measuredWeight = 0;

    function startInventory(article) {
        selectedArticle = article;
        modalError = '';
        const slots = getBarcodes(article);
        
        const dirtySlots = slots.filter(slot => getSlotStatus(article, slot).isDirty);
        if (dirtySlots.length === 0) return;
        
        // 🔥 FEATURE: Wenn nur noch 1 Fach ungeprüft ist, überspringen wir das Auswahlmenü sofort!
        if (dirtySlots.length === 1) {
            activeBarcode = dirtySlots[0];
            triggerInitForm();
        } else {
            wizardState = 'select_slot';
            showModal = true;
        }
    }

    let hiddenInitFormBtn;
    function triggerInitForm() {
        showModal = true;
        wizardState = 'take_out'; 
        setTimeout(() => { if (hiddenInitFormBtn) hiddenInitFormBtn.click(); }, 100);
    }

    $: oldDrawerStock = (() => {
        if (!selectedArticle || !activeBarcode) return 0;
        if (Array.isArray(selectedArticle.assigned_barcodes)) {
            const drawer = selectedArticle.assigned_barcodes.find(b => typeof b === 'object' ? b.barcode === activeBarcode : b === activeBarcode);
            if (drawer && typeof drawer === 'object') return parseFloat(drawer.stock) || 0;
        } 
        return parseFloat(selectedArticle.istBestand) || 0;
    })();

    $: newDrawerStock = (() => {
        if (!selectedArticle) return 0;
        const boxWeight = parseFloat(currentBoxWeight) || 0; 
        const itemWeight = parseFloat(selectedArticle.attributes?.itemWeight) || 1; 
        const netWeight = Math.max(0, measuredWeight - boxWeight);
        return Math.round(netWeight / itemWeight);
    })();

    $: difference = newDrawerStock - oldDrawerStock;

    function startPolling() {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/scale/${requestId}`);
                const data = await res.json();
                if (data.status === 'done' && data.weight !== null) {
                    clearInterval(pollInterval);
                    measuredWeight = data.weight;
                    wizardState = 'confirm';
                }
            } catch (err) {
                console.error("Polling Fehler", err);
            }
        }, 500); 
    }

    function closeModal() {
        showModal = false;
        if (pollInterval) clearInterval(pollInterval);
        selectedArticle = null;
    }

    onDestroy(() => {
        if (pollInterval) clearInterval(pollInterval);
    });
</script>

<div class="terminal-page space-grotesk">
    <div class="header">
        <div class="title-area">
            <h1>Inventarpflege</h1>
            <p class="subtitle">Artikel mit unkontrollierten Bestandsbewegungen</p>
        </div>
        <a href="/terminal/settings" class="btn-back">Zurück zu Settings</a>
    </div>

    <!-- FILTER BEREICH -->
    <div class="filter-bar">
        <div class="filter-group">
            <span class="icon">⏳</span>
            <label for="timeFilter">Unkontrolliert seit mindestens:</label>
            <select id="timeFilter" bind:value={filterValue} class="modern-select">
                {#each filterOptions as option}
                    <option value={option.value}>{option.label}</option>
                {/each}
            </select>
        </div>
        <div class="results-count">
            <strong>{filteredArticles.length}</strong> Artikel erfordern Überprüfung
        </div>
    </div>

    <!-- ARTIKEL LISTE -->
    <div class="article-grid">
        {#if filteredArticles.length === 0}
            <div class="empty-state">
                <span class="icon">✅</span>
                <h2>Alles im grünen Bereich!</h2>
                <p>Es gibt aktuell keine Artikel, die deine Filterkriterien erfüllen.</p>
            </div>
        {:else}
            {#each filteredArticles as article}
                {@const slots = getBarcodes(article)}
                
                <div class="article-card">
                    <div class="card-header">
                        <div class="img-wrapper">
                            {#if article.imagePath}<img src={article.imagePath} alt={article.title}>{:else}<span class="no-img">📷</span>{/if}
                        </div>
                        <div class="title-info">
                            <h3>{article.title}</h3>
                            {#if article.sku}<span class="sku-badge">SKU: {article.sku}</span>{/if}
                        </div>
                    </div>

                    <div class="time-stats">
                        <div class="stat-row danger">
                            <span class="label">Zuletzt unkontrolliert bewegt am</span>
                            <span class="value">
                                {formatDate(Math.max(
                                    article.lastPickedAt ? new Date(article.lastPickedAt).getTime() : 0,
                                    article.lastReturnedAt ? new Date(article.lastReturnedAt).getTime() : 0
                                ))}
                            </span>
                        </div>
                    </div>

                    <div class="card-actions">
                        {#if slots.length > 0}
                            <form method="POST" action="?/triggerLED" use:enhance>
                                <input type="hidden" name="barcodes" value={JSON.stringify(slots)}>
                                <button type="submit" class="btn-led">💡 Suchen</button>
                            </form>
                            <button class="btn-primary" on:click={() => startInventory(article)}>
                                ⚖️ Inventur starten
                            </button>
                        {:else}
                            <div class="no-slot-warning">Kein Fach zugewiesen</div>
                        {/if}
                    </div>
                </div>
            {/each}
        {/if}
    </div>
</div>

<!-- ======================================================= -->
<!-- VERSTECKTES FORMULAR (Für den automatischen Start)      -->
<!-- ======================================================= -->
{#if selectedArticle && activeBarcode}
    <form method="POST" action="?/initMaintenance" style="display:none;" use:enhance={() => {
        return async ({ result }) => {
            if(result.data?.success) {
                currentBoxWeight = result.data.boxWeight;
                activeBarcode = result.data.barcode;
                wizardState = 'take_out';
            } else {
                modalError = result.data?.error || 'Fehler beim Laden der Box-Daten';
                wizardState = 'error';
            }
        };
    }}>
        <input type="hidden" name="barcode" value={activeBarcode}>
        <button type="submit" bind:this={hiddenInitFormBtn}></button>
    </form>
{/if}

<!-- ======================================================= -->
<!-- DAS GEFÜHRTE INVENTUR-MODAL                             -->
<!-- ======================================================= -->
{#if showModal && selectedArticle}
    <div class="modal-backdrop"></div>
    <div class="modal-window">
        <div class="modal-header">
            <h3><span class="icon">⚖️</span> Inventur: {selectedArticle.title}</h3>
            <button class="btn-close-modal" on:click={closeModal}>✕</button>
        </div>
        
        <div class="modal-body text-center">

            <!-- FEHLER STATUS -->
            {#if wizardState === 'error'}
                <div class="emoji-hero bounce">❌</div>
                <h2 class="text-red">Fehler aufgetreten</h2>
                <p class="text-gray">{modalError}</p>
                <button class="btn-cancel mt-3 full-width" on:click={closeModal}>Abbrechen</button>

            <!-- SCHRITT 0: FACH AUSWÄHLEN -->
            {:else if wizardState === 'select_slot'}
                <div class="emoji-hero">🗄️</div>
                <h2>Welches Fach möchtest du prüfen?</h2>
                <p class="text-gray mb-3">Dieser Artikel liegt in mehreren Fächern. Saubere Fächer sind gesperrt.</p>
                
                <div class="button-stack">
                    {#each getBarcodes(selectedArticle) as slot, index}
                        {@const status = getSlotStatus(selectedArticle, slot)}
                        
                        {#if status.isDirty}
                            <form method="POST" action="?/initMaintenance" use:enhance={() => {
                                wizardState = 'take_out';
                                return async ({ result }) => {
                                    if(result.data?.success) {
                                        currentBoxWeight = result.data.boxWeight;
                                        activeBarcode = result.data.barcode;
                                    } else {
                                        modalError = result.data?.error;
                                        wizardState = 'error';
                                    }
                                };
                            }}>
                                <input type="hidden" name="barcode" value={slot}>
                                <button type="submit" class="btn-cancel full-width slot-btn">
                                    Platz {index + 1}: <strong>{slot}</strong> <span class="text-blue">(Prüfen)</span>
                                </button>
                            </form>
                        {:else}
                            <div class="clean-slot">
                                <span class="icon">✅</span> Platz {index + 1}: <strong>{slot}</strong> (Bereits aktuell)
                            </div>
                        {/if}
                    {/each}
                </div>

            <!-- SCHRITT 1: ENTNEHMEN -->
            {:else if wizardState === 'take_out'}
                <div class="step-indicator">Schritt 1 von 3</div>
                <div class="emoji-hero pulse-blue">📤</div>
                <h2 class="text-blue">1. Box entnehmen</h2>
                <div class="info-card mt-2 mb-3">
                    <p>Das Fach <strong>{activeBarcode}</strong> leuchtet im Regal auf.</p>
                    <p class="mt-1 text-white">Nimm die Box heraus und stelle sie auf die Waage.</p>
                </div>
                
                <form method="POST" action="?/requestScale" use:enhance={() => {
                    wizardState = 'weighing'; 
                    return async ({ result }) => {
                        if (result.data?.success) { requestId = result.data.requestId; startPolling(); }
                    };
                }}>
                    <input type="hidden" name="barcode" value={activeBarcode}>
                    <button type="submit" class="huge-btn btn-blue full-width">
                        Waage starten
                    </button>
                </form>

            <!-- SCHRITT 2: WIEGEN -->
            {:else if wizardState === 'weighing'}
                <div class="scale-animation box-shadow-glow">
                    <div class="spinner"></div>
                    <h2>Messe Bestand...</h2>
                    <p>Bitte die Box ruhig stehen lassen.</p>
                </div>

            <!-- SCHRITT 3: BUCHEN -->
            {:else if wizardState === 'confirm'}
                <div class="step-indicator">Schritt 2 von 3</div>
                <h2>Messergebnis prüfen</h2>
                
                <div class="modern-stats mb-2">
                    <div class="stat-box">
                        <span class="label">Gesamtgewicht</span>
                        <span class="value">{measuredWeight}g</span>
                    </div>
                    <div class="stat-box">
                        <span class="label">Netto</span>
                        <span class="value text-blue">{Math.max(0, measuredWeight - currentBoxWeight).toFixed(1)}g</span>
                    </div>
                </div>

                <div class="result-card">
                    <span class="label">Neuer Bestand (dieses Fach)</span>
                    <h3 class="result-value">{newDrawerStock} <small>Stück</small></h3>
                    <div class="diff-indicator mt-1">
                        {#if difference > 0}<span class="text-green">+{difference} gefunden</span>
                        {:else if difference < 0}<span class="text-red">{difference} verbucht</span>
                        {:else}<span class="text-gray">Keine Differenz</span>{/if}
                    </div>
                </div>

                <form method="POST" action="?/bookInventory" use:enhance={() => {
                    wizardState = 'success';
                    return async ({ update, result }) => {
                        await update();
                        await invalidateAll();
                    };
                }}>
                    <input type="hidden" name="articleId" value={selectedArticle._id}>
                    <input type="hidden" name="barcode" value={activeBarcode}>
                    <input type="hidden" name="newStock" value={newDrawerStock}>
                    
                    <button type="submit" class="huge-btn btn-green full-width mt-3">
                        <span class="icon">💾</span> Buchen & Einlagern
                    </button>
                </form>

            <!-- SCHRITT 4: EINLAGERN (ERFOLG) -->
            {:else if wizardState === 'success'}
                <div class="step-indicator">Schritt 3 von 3</div>
                <div class="success-animation">
                    <div class="emoji-hero bounce">📥</div>
                    <h2 class="text-green">Erfolgreich!</h2>
                    <div class="info-card mt-2 mb-3">
                        <p>Der Bestand wurde korrigiert und die Inventur gespeichert.</p>
                        <p class="mt-1 text-white">Das Fach leuchtet erneut. <strong>Bitte räume die Box jetzt wieder ein.</strong></p>
                    </div>
                    <button class="huge-btn btn-blue full-width" on:click={closeModal}>
                        Abschließen
                    </button>
                </div>
            {/if}

        </div>
    </div>
{/if}

<style>
    /* --- Basis Layout --- */
    :root {
        --bg-dark: #0f172a; --bg-card: #1e293b; --border-color: #334155; 
        --color-blue: #3b82f6; --color-green: #22c55e; --color-red: #ef4444; 
    }

    .terminal-page { max-width: 1400px; margin: 0 auto; padding: 2rem; color: #f8fafc; }
    
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1.5rem; }
    h1 { color: var(--color-green); margin: 0 0 0.5rem 0; font-size: 2.5rem; }
    .subtitle { color: #94a3b8; margin: 0; font-size: 1.1rem; }
    
    .btn-back { background: var(--bg-card); color: white; padding: 0.8rem 1.2rem; border-radius: 12px; border: 1px solid #475569; text-decoration: none; font-weight: bold; transition: all 0.2s; }
    .btn-back:hover { background: #334155; }

    /* --- Filter Bar --- */
    .filter-bar { display: flex; justify-content: space-between; align-items: center; background: var(--bg-card); padding: 1.5rem; border-radius: 16px; border: 1px solid var(--border-color); margin-bottom: 2rem; }
    .filter-group { display: flex; align-items: center; gap: 1rem; }
    .filter-group label { color: #94a3b8; font-weight: 600; text-transform: uppercase; font-size: 0.9rem; }
    .modern-select { background: var(--bg-dark); color: white; border: 1px solid #4ade80; padding: 0.8rem 1.2rem; border-radius: 8px; font-size: 1.1rem; font-weight: bold; outline: none; cursor: pointer; }
    
    .results-count { font-size: 1.1rem; color: #cbd5e1; }
    .results-count strong { color: #4ade80; font-size: 1.4rem; }

    /* --- Grid & Cards --- */
    .article-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 1.5rem; }
    .article-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }
    
    .card-header { display: flex; gap: 1rem; align-items: center; }
    .img-wrapper { width: 70px; height: 70px; background: white; border-radius: 10px; display: flex; align-items: center; justify-content: center; padding: 0.5rem; flex-shrink: 0; }
    .img-wrapper img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .no-img { font-size: 2rem; opacity: 0.5; filter: grayscale(1); }
    
    .title-info h3 { margin: 0 0 0.5rem 0; font-size: 1.2rem; color: white; line-height: 1.3; }
    .sku-badge { background: var(--bg-dark); color: #94a3b8; padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.8rem; font-family: monospace; border: 1px solid var(--border-color); }

    .time-stats { background: var(--bg-dark); border-radius: 10px; padding: 1rem; display: flex; flex-direction: column; gap: 0.8rem; border: 1px solid var(--border-color); }
    .stat-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.95rem; }
    .stat-row .label { color: #94a3b8; }
    .stat-row .value { color: white; font-weight: 600; font-variant-numeric: tabular-nums; }
    .stat-row.danger .label { color: #fca5a5; font-weight: bold; }
    .stat-row.danger .value { color: var(--color-red); }

    .card-actions { display: flex; gap: 0.8rem; margin-top: auto; }
    .btn-led { flex: 1; background: transparent; border: 1px dashed var(--color-blue); color: var(--color-blue); padding: 0.8rem; border-radius: 8px; font-weight: bold; cursor: pointer; transition: all 0.2s; }
    .btn-led:hover { background: rgba(59, 130, 246, 0.1); border-style: solid; }
    .btn-primary { flex: 1.5; background: var(--color-blue); color: white; border: none; padding: 0.8rem; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 1rem; transition: background 0.2s; }
    .btn-primary:hover { background: #2563eb; }
    .no-slot-warning { width: 100%; text-align: center; color: var(--color-red); background: rgba(239, 68, 68, 0.1); padding: 0.8rem; border-radius: 8px; font-weight: bold; }

    /* --- Modals --- */
    .modal-overlay, .modal-backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(4px); z-index: 1000; }
    .modal-window { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 20px; z-index: 1001; width: 95%; max-width: 500px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); overflow: hidden; }
    
    .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem 2rem; border-bottom: 1px solid var(--border-color); background: rgba(0,0,0,0.2); }
    .modal-header h3 { margin: 0; color: white; font-size: 1.2rem; }
    .btn-close-modal { background: none; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer; }
    
    .modal-body { padding: 2.5rem 2rem; }
    .text-center { text-align: center; }
    .mt-2 { margin-top: 1rem; } .mb-3 { margin-bottom: 1.5rem; } .mt-3 { margin-top: 1.5rem; } .full-width { width: 100%; }
    .text-blue { color: var(--color-blue); } .text-green { color: var(--color-green); } .text-red { color: var(--color-red); } .text-gray { color: #94a3b8; } .text-white { color: white; }

    .step-indicator { display: inline-block; background: var(--bg-dark); color: #60a5fa; padding: 0.4rem 1rem; border-radius: 20px; font-weight: 700; font-size: 0.85rem; margin-bottom: 1.5rem; border: 1px solid rgba(59, 130, 246, 0.2); text-transform: uppercase; }
    .emoji-hero { font-size: 4.5rem; margin-bottom: 1rem; line-height: 1; }
    .pulse-blue { animation: pulse 2s infinite; text-shadow: 0 0 20px rgba(59,130,246,0.5); }
    
    .info-card { background: var(--bg-dark); border: 1px solid var(--border-color); padding: 1.5rem; border-radius: 12px; }
    .info-card p { margin: 0; line-height: 1.5; color: #cbd5e1; }
    
    .huge-btn { padding: 1.2rem 2rem; font-size: 1.1rem; border-radius: 12px; font-weight: bold; cursor: pointer; border: none; color: white; transition: transform 0.2s; }
    .huge-btn:hover { transform: translateY(-2px); }
    .btn-blue { background: var(--color-blue); } .btn-green { background: var(--color-green); }
    .btn-cancel { background: transparent; border: 1px solid var(--border-color); color: #94a3b8; padding: 1rem; border-radius: 12px; font-weight: bold; cursor: pointer; }
    
    .slot-btn { display: flex; justify-content: center; gap: 0.5rem; font-size: 1.1rem; padding: 1.2rem; margin-bottom: 0.5rem; }
    .slot-btn:hover { background: rgba(255,255,255,0.05); color: white; }

    .clean-slot { display: flex; justify-content: center; gap: 0.5rem; font-size: 1.1rem; padding: 1.2rem; margin-bottom: 0.5rem; background: rgba(34, 197, 94, 0.1); color: #4ade80; border: 1px solid #4ade80; border-radius: 12px; cursor: default; font-weight: bold; }

    .scale-animation { padding: 3rem 2rem; background: var(--bg-dark); border-radius: 16px; border: 1px dashed var(--color-blue); }
    .spinner { width: 50px; height: 50px; border: 4px solid var(--border-color); border-top-color: var(--color-blue); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1.5rem auto; }
    
    .modern-stats { display: flex; gap: 1rem; justify-content: center; background: var(--bg-dark); padding: 1rem; border-radius: 12px; border: 1px solid var(--border-color); }
    .modern-stats .stat-box { flex: 1; display: flex; flex-direction: column; align-items: center; }
    .modern-stats .label { color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; font-weight: bold; }
    .modern-stats .value { font-size: 1.4rem; font-weight: 800; }
    
    .result-card { background: linear-gradient(145deg, var(--bg-dark), #0a101d); padding: 2rem; border-radius: 12px; border: 1px solid var(--border-color); margin: 1.5rem 0; display: flex; flex-direction: column; align-items: center; }
    .result-card .label { color: #60a5fa; font-size: 0.9rem; text-transform: uppercase; font-weight: bold; }
    .result-value { font-size: 3rem; margin: 0.5rem 0 0 0; color: var(--color-green); line-height: 1; }
    .diff-indicator { font-size: 1.1rem; font-weight: bold; }

    .empty-state { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(34, 197, 94, 0.05); border: 2px dashed #22c55e; border-radius: 16px; padding: 4rem 2rem; text-align: center; margin-top: 2rem; }
    .empty-state .icon { font-size: 4rem; margin-bottom: 1rem; }

    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
    @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
</style>