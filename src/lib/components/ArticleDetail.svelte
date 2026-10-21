<script>
    import { imageUrl } from '$lib/imageUrl.js';
    // Artikel-Detailansicht – genutzt von /[id] (Web) und /terminal/search/[id] (Terminal).
    // Im Terminal-Modus ohne Kopieren, Bearbeiten und Bestandsänderung.
    import { enhance } from "$app/forms";
    import { beforeNavigate } from "$app/navigation";
    import { onDestroy } from "svelte";
    
    export let data;
    export let terminal = false;
    const { article, categories, attributes } = data;

    // Alle Artikelbilder (erstes = Hauptbild); per Vorschaubild umschalten
    const images = Array.isArray(article.images) && article.images.length > 0
        ? article.images
        : (article.imagePath ? [article.imagePath] : []);
    let activeImage = 0;

    // Herkunft einer Bestandsänderung (Bewegungsprotokoll)
    const sourceLabels = {
        'web': 'Bestand angepasst', 'web-bearbeiten': 'Artikel bearbeitet', 'angelegt': 'Artikel angelegt', 'import': 'CSV-Import',
        'terminal-rueckgabe': 'Rückgabe am Terminal', 'terminal-inventur': 'Inventur am Terminal',
        'terminal-zuweisung': 'Fach zugewiesen/gewogen', 'terminal-fach-leer': 'Fach geleert'
    };

    // --- 1. Kategorienamen auflösen ---
    const mainCategory = categories.find(c => c._id === article.mainCategoryId);
    const mainCategoryName = mainCategory ? mainCategory.name : 'Unbekannte Kategorie';
    
    let subCategoryName = "";
    if (mainCategory && article.subcategoryId) {
        const subCat = mainCategory.subcategories.find(s => s.id === article.subcategoryId);
        if (subCat) subCategoryName = subCat.name;
    }

    // --- 2. Spezifikationen auflösen und formatieren ---
    let displayAttributes = [];
    if (article.attributes) {
        for (const [attrId, value] of Object.entries(article.attributes)) {
            const attrDef = attributes.find(a => a._id === attrId);
            
            if (attrDef && value !== undefined && value !== "") {
                const displayValue = Array.isArray(value) ? value.join(', ') : value;
                
                displayAttributes.push({
                    label: attrDef.label,
                    value: displayValue,
                    unit: attrDef.unit ? ` ${attrDef.unit.trim()}` : ''
                });
            }
        }
        displayAttributes.sort((a, b) => a.label.localeCompare(b.label, 'de', { sensitivity: 'base' }));
    }

    // --- 3. Bestands-Management ---
    let originalStock = article.istBestand || 0;
    let localStock = originalStock;
    let isUpdatingStock = false;
    let stockUpdateSuccess = false;

    // --- 4. Im Regal aufleuchten lassen ---
    const ledColor = data.userColor || '#3b82f6';
    // Fächer des Artikels (neues und altes Datenformat)
    $: storedSlots = Array.isArray(data.article.assigned_barcodes) && data.article.assigned_barcodes.length > 0
        ? data.article.assigned_barcodes.map(b => (typeof b === 'object' ? b.barcode : b)).filter(Boolean)
        : (data.article.assigned_barcode ? [data.article.assigned_barcode] : []);
    $: isStored = storedSlots.length > 0;

    let ledActive = false;
    let ledSending = false;
    let ledError = '';
    let ledTimer;

    // Beim Verlassen der Seite die LEDs sofort ausschalten
    function turnOffLeds() {
        if (!ledActive) return;
        ledActive = false;
        clearTimeout(ledTimer);
        fetch('?/turnOffLED', { method: 'POST', body: new FormData(), keepalive: true }).catch(() => {});
    }
    beforeNavigate(turnOffLeds);
    onDestroy(() => clearTimeout(ledTimer));

    // Synchronisiere, falls sich die Daten vom Server ändern (nach dem Speichern)
    $: if (data.article.istBestand !== originalStock) {
        originalStock = data.article.istBestand || 0;
        localStock = originalStock;
    }
</script>

<div class="page-container space-grotesk" class:in-terminal={terminal}>
    
    {#if terminal}
        <!-- Handy: Zurück-Button ganz oben, damit man ohne Scrollen zur Suche kommt -->
        <a href="/terminal/search" class="btn-back-search btn-back-top">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            Zurück zur Suche
        </a>
    {/if}

    <nav class="breadcrumb">
        <a href={terminal ? '/terminal/search' : '/'}>{terminal ? 'Artikelsuche' : 'Übersicht'}</a> 
        <span class="separator">/</span>
        <span class="cat">{mainCategoryName}</span>
        {#if subCategoryName}
            <span class="separator">/</span>
            <span class="cat">{subCategoryName}</span>
        {/if}
    </nav>

    <div class="article-layout">
        
        <div class="media-column">
            <div class="image-section">
                {#if images.length > 0}
                    <img src={imageUrl(images[activeImage], 1000)} alt={article.title} class="main-image" />
                {:else}
                    <div class="no-image-placeholder">
                        <span>Kein Artikelbild vorhanden</span>
                    </div>
                {/if}
            </div>

            {#if images.length > 1}
                <div class="thumb-strip">
                    {#each images as url, index}
                        <button type="button" class="thumb" class:active={index === activeImage} on:click={() => (activeImage = index)} aria-label="Bild {index + 1} anzeigen">
                            <img src={imageUrl(url, 160)} alt="" loading="lazy" />
                        </button>
                    {/each}
                </div>
            {/if}

            <!-- Artikel im Regal aufleuchten lassen -->
            {#if isStored}
                <form method="POST" action="?/lightUp" use:enhance={() => {
                    ledSending = true;
                    ledError = '';
                    return async ({ result }) => {
                        ledSending = false;
                        if (result.type === 'success' && result.data?.success) {
                            ledActive = true;
                            clearTimeout(ledTimer);
                            ledTimer = setTimeout(() => { ledActive = false; }, result.data.durationMs || 10000);
                        } else {
                            ledError = result.data?.ledError || 'Das Regal konnte nicht angesteuert werden.';
                        }
                    };
                }}>
                    <button
                        type="submit"
                        class="btn-light-up"
                        class:active={ledActive}
                        disabled={ledSending}
                        style={ledActive ? `background-color: ${ledColor}; border-color: ${ledColor}; box-shadow: 0 4px 20px ${ledColor}80;` : ''}
                    >
                        <span class="light-icon">{ledActive ? '✓' : '💡'}</span>
                        {#if ledSending}
                            Wird gesendet…
                        {:else if ledActive}
                            Leuchtet für 10 Sekunden
                        {:else}
                            {storedSlots.length > 1 ? `Alle ${storedSlots.length} Fächer aufleuchten lassen` : 'Im Regal aufleuchten lassen'}
                        {/if}
                    </button>
                </form>
                {#if ledError}
                    <div class="led-error">{ledError}</div>
                {/if}
            {:else}
                <button type="button" class="btn-light-up not-stored" disabled>
                    <span class="light-icon">📦</span>
                    Nicht eingelagert
                </button>
            {/if}
        </div>

        <div class="info-section">
            
            <div class="title-header">
                <h1 class="title">{article.title}</h1>
                
                <!-- Container für die Action-Buttons (nicht im Terminal) -->
                {#if terminal}
                <div class="action-buttons">
                    <!-- Die Filter der Suche bleiben gespeichert -->
                    <a href="/terminal/search" class="btn-back-search btn-back-inline">
                        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                        Zurück zur Suche
                    </a>
                </div>
                {:else}
                <div class="action-buttons">
                    <a href="/addarticle?copy={article._id}" class="btn-copy" title="Artikel kopieren">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        Kopieren
                    </a>
                    
                    <a href="/editarticle/{article._id}" class="btn-edit">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                        Bearbeiten
                    </a>
                </div>
                {/if}
            </div>
            
            <div class="price-stock-box">
                {#if article.price}
                    <div class="price">{article.price.toFixed(2)} CHF <span style="font-size: 1rem; color: #94a3b8; font-weight: 500;">/ Stk.</span></div>
                {/if}
                
                <div class="stock-manager">
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

                    {#if !terminal}
                    <form method="POST" action="?/updateStock" class="stock-form" 
                        use:enhance={() => {
                            isUpdatingStock = true;
                            
                            return async ({ result, update }) => {
                                isUpdatingStock = false;
                                
                                if (result.type === 'success') {
                                    stockUpdateSuccess = true;
                                    setTimeout(() => stockUpdateSuccess = false, 2500);
                                    
                                    // SvelteKit-Reset verhindern, aber DB-Daten neu laden
                                    await update({ reset: false });
                                } else {
                                    // Bei einem Fehler normales Update ausführen
                                    await update();
                                }
                            };
                        }}>
                        
                        <input type="hidden" name="articleId" value={article._id} />
                        
                        <div class="stock-controls">
                            <button type="button" class="btn-stepper" on:click={() => {if(localStock > 0) localStock--}}>−</button>
                            <input type="number" name="newStock" class="stock-input" bind:value={localStock} min="0" />
                            <button type="button" class="btn-stepper" on:click={() => localStock++}>+</button>
                        </div>

                        {#if localStock !== originalStock}
                            <button type="submit" class="btn-save-stock" disabled={isUpdatingStock}>
                                {isUpdatingStock ? '...' : 'Speichern'}
                            </button>
                        {/if}

                        {#if stockUpdateSuccess && localStock === originalStock}
                            <span class="stock-success-msg">✓ Aktualisiert</span>
                        {/if}
                    </form>
                    {/if}
                </div>
            </div>

            <div class="description">
                <h3>Beschreibung</h3>
                <p>{article.description}</p>
            </div>

            {#if data.movements?.length}
                <div class="movements">
                    <h3>Bestandsverlauf</h3>
                    <ul>
                        {#each data.movements as m (m.id)}
                            <li>
                                <span class="mv-delta" class:plus={m.delta > 0} class:minus={m.delta < 0}>{m.delta > 0 ? '+' : ''}{m.delta}</span>
                                <span class="mv-stock">→ {m.after} Stk.</span>
                                <span class="mv-meta">{sourceLabels[m.source] || m.source}{m.userName ? ` · ${m.userName}` : ''} · {new Date(m.createdAt).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' })}</span>
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}

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

            {#if article.orderLink && /^https?:\/\//i.test(article.orderLink)}
                <div class="actions">
                    <a href={article.orderLink} target="_blank" rel="noopener noreferrer" class="btn-order">
                        Artikel aufrufen
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </a>
                </div>
            {/if}

            {#if displayAttributes.length > 0}
                <div class="specs-section">
                    <h3>Spezifikationen</h3>
                    <table class="specs-table">
                        <tbody>
                            {#each displayAttributes as attr}
                                <tr>
                                    <td class="spec-label">{attr.label}</td>
                                    <td class="spec-value">{attr.value}{attr.unit}</td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {/if}

        </div>
    </div>
</div>

<style>
    /* Generelles Layout - Hybrid Theme (Weiße Karten auf dunklem Grund) */
    .page-container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 2rem 1rem;
        /* Basis-Textfarbe für alles, was auf dem dunklen Grund liegt */
        color: #cbd5e1; 
    }

    /* Breadcrumbs - Aufgehellt für dunklen Hintergrund */
    .breadcrumb {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.95rem;
        margin-bottom: 2rem;
        color: #94a3b8;
    }
    .breadcrumb a { color: #60a5fa; text-decoration: none; }
    .breadcrumb a:hover { text-decoration: underline; color: #93c5fd; }
    .separator { color: #64748b; }
    /* WICHTIG: Die Kategorienamen leuchten jetzt in Weiß */
    .cat { font-weight: 600; color: #f8fafc; }

    /* Layout */
    .article-layout {
        display: flex;
        gap: 3rem;
        align-items: flex-start;
    }

    /* Linke Spalte: Bild + Leucht-Button */
    .media-column {
        flex: 1;
        position: sticky;
        top: 2rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-width: 0;
    }

    .btn-light-up {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        background: #3b82f6;
        color: white;
        border: 2px solid #3b82f6;
        border-radius: 8px;
        padding: 1rem 1.25rem;
        font-size: 1.1rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 4px 14px rgba(59, 130, 246, 0.3);
    }
    .btn-light-up:hover:not(:disabled) { background: #2563eb; border-color: #2563eb; transform: translateY(-2px); }
    .btn-light-up:disabled { cursor: default; }
    .btn-light-up.active { transform: none; }
    /* Nicht eingelagert: ausgegraut */
    .btn-light-up.not-stored {
        background: #1e293b;
        border-color: #334155;
        color: #64748b;
        box-shadow: none;
        cursor: not-allowed;
    }
    .light-icon { font-size: 1.4rem; line-height: 1; }
    .btn-light-up.not-stored .light-icon { filter: grayscale(1); opacity: 0.6; }
    .led-error { color: #fca5a5; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 8px; padding: 0.6rem 0.9rem; font-size: 0.95rem; }

    /* Linke Seite (Bild) - Bleibt eine weiße Karte */
    .image-section {
        background: #ffffff; 
        border: 1px solid #e2e8f0; 
        border-radius: 8px;
        padding: 2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 400px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .main-image { max-width: 100%; max-height: 500px; object-fit: contain; mix-blend-mode: multiply; }

    /* Vorschaubilder bei mehreren Artikelbildern */
    .thumb-strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 0.5rem; }
    .thumb {
        aspect-ratio: 4 / 3; background: #ffffff; border: 2px solid #334155; border-radius: 6px; padding: 0.2rem;
        cursor: pointer; display: flex; align-items: center; justify-content: center; overflow: hidden; transition: border-color 0.15s;
    }
    .thumb:hover { border-color: #93c5fd; }
    .thumb.active { border-color: #22c55e; }
    .thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .no-image-placeholder { color: #94a3b8; font-size: 1.1rem; font-style: italic; }

    /* Rechte Seite (Infos) */
    .info-section {
        flex: 1.5;
        display: flex;
        flex-direction: column;
        gap: 2rem;
    }

    /* Header mit Buttons */
    .title-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
    }

    .title {
        margin: 0;
        font-size: 2.2rem;
        color: #22c55e; 
        line-height: 1.2;
    }

    /* Terminal: gut treffbarer Zurück-Button */
    .btn-back-search {
        display: inline-flex; align-items: center; gap: 0.5rem; white-space: nowrap;
        background: #334155; color: #f8fafc; border: 1px solid #475569; border-radius: 8px;
        padding: 0.8rem 1.25rem; font-weight: 700; font-size: 1rem; text-decoration: none; transition: background 0.2s;
    }
    .btn-back-search:hover { background: #475569; color: #ffffff; }
    .btn-back-top { display: none; }

    /* Container für Kopieren & Bearbeiten Button */
    .action-buttons {
        display: flex;
        gap: 0.8rem;
        align-items: center;
    }

    .btn-edit {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        background: #ffffff;
        color: #1e293b;
        text-decoration: none;
        padding: 0.6rem 1rem;
        border-radius: 6px;
        font-size: 0.9rem;
        font-weight: 600;
        border: 1px solid #cbd5e1;
        transition: all 0.2s;
        white-space: nowrap;
    }
    .btn-edit:hover {
        background: #f8fafc;
        border-color: #94a3b8;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }

    .btn-copy {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        background: transparent;
        color: #94a3b8;
        text-decoration: none;
        padding: 0.6rem 1rem;
        border-radius: 6px;
        font-size: 0.9rem;
        font-weight: 600;
        border: 1px solid #475569;
        transition: all 0.2s;
        white-space: nowrap;
    }
    .btn-copy:hover {
        background: rgba(255, 255, 255, 0.05);
        color: #cbd5e1;
        border-color: #64748b;
    }

    /* Preis & Bestand Container */
    .price-stock-box {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        padding-bottom: 1.5rem;
        border-bottom: 1px solid #334155;
    }

    .price {
        font-size: 1.8rem;
        font-weight: 700;
        color: #38bdf8; 
    }

    /* Bestands-Manager Flexbox */
    .stock-manager {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 1.5rem;
    }

    /* Badges (Lagerbestand) */
    .stock-info {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 600;
        color: #166534; 
        background: #dcfce7;
        padding: 0.4rem 0.8rem;
        border-radius: 6px;
        border: 1px solid #bbf7d0;
    }
    .indicator { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; }

    .stock-info.low-stock { color: #b91c1c; background: #fee2e2; border-color: #fecaca; }
    .stock-info.low-stock .indicator { background: #ef4444; }
    
    .stock-info.out-of-stock { color: #b91c1c; background: #fee2e2; border-color: #fecaca; }
    .stock-info.out-of-stock .indicator { background: #ef4444; }

    /* Schneller Bestands-Editor - Bleibt weiß */
    .stock-form {
        display: flex;
        align-items: center;
        gap: 0.8rem;
    }
    .stock-controls {
        display: flex;
        align-items: center;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        overflow: hidden;
    }
    .btn-stepper {
        background: #f8fafc;
        color: #334155;
        border: none;
        width: 32px;
        height: 32px;
        font-size: 1.2rem;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
    }
    .btn-stepper:hover { background: #e2e8f0; }
    .stock-input {
        background: transparent;
        color: #1e293b;
        border: none;
        width: 50px;
        text-align: center;
        font-size: 1rem;
        font-weight: 600;
        -moz-appearance: textfield;
        font-family: inherit;
    }
    .stock-input::-webkit-outer-spin-button,
    .stock-input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }
    .stock-input:focus { outline: none; background: #f8fafc; }

    .btn-save-stock {
        background: #3b82f6; 
        color: white;
        border: none;
        padding: 0.4rem 0.8rem;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
        animation: fadeIn 0.2s ease-out;
    }
    .btn-save-stock:hover { background: #2563eb; }
    .btn-save-stock:disabled { background: #94a3b8; cursor: not-allowed; }

    .stock-success-msg {
        color: #4ade80; 
        font-size: 0.9rem;
        font-weight: 600;
        animation: fadeIn 0.2s ease-out;
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateX(-5px); }
        to { opacity: 1; transform: translateX(0); }
    }

    .description h3, .specs-section h3 {
        font-size: 1.2rem;
        color: #ffffff; 
        margin: 0 0 1rem 0;
    }
    .description p {
        line-height: 1.6;
        color: #cbd5e1; 
        margin: 0;
        white-space: pre-wrap;
    }

    /* Meta Grid - Bleibt eine weiße Karte */
    .meta-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1.5rem;
        background: #ffffff; 
        padding: 1.5rem;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    .meta-item { display: flex; flex-direction: column; gap: 0.3rem; }
    .meta-label { font-size: 0.85rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
    .meta-value { font-weight: 600; color: #1e293b; }

    /* Externe Bestellung Button (Hell) */
    .btn-order {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        background: transparent;
        color: #60a5fa;
        border: 1px solid #60a5fa;
        padding: 0.8rem 1.5rem;
        border-radius: 6px;
        text-decoration: none;
        font-weight: 600;
        transition: all 0.2s;
    }
    .btn-order:hover {
        background: rgba(96, 165, 250, 0.1);
        color: #93c5fd;
    }

    /* Spezifikationen Tabelle - Bleibt eine weiße Karte */
    .specs-table { 
        width: 100%; 
        border-collapse: collapse; 
        border: 1px solid #e2e8f0; 
        border-radius: 8px; 
        overflow: hidden; 
        background: #ffffff;
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    .specs-table tr:nth-child(odd) { background: #f8fafc; }
    .specs-table td { padding: 0.8rem 1rem; border-bottom: 1px solid #e2e8f0; }
    .specs-table tr:last-child td { border-bottom: none; }
    .spec-label { width: 40%; color: #64748b; font-weight: 500; }
    .spec-value { color: #1e293b; font-weight: 600; } 

    /* Responsive */
    @media (max-width: 900px) {
        .article-layout { flex-direction: column; }
        .media-column { position: static; width: 100%; }
        .image-section { width: 100%; box-sizing: border-box; min-height: 300px; }
        .title-header { flex-direction: column; }
        .action-buttons { align-self: flex-start; width: 100%; }
        .btn-edit, .btn-copy, .btn-back-search { flex: 1; justify-content: center; }
        .title { overflow-wrap: anywhere; }
    }

    @media (max-width: 640px) {
        .title { font-size: 1.7rem; }
    }

    /* Im Terminal-Rahmen gibt es schon einen Innenabstand – auf dem Handy nicht doppeln */
    @media (max-width: 640px) {
        .page-container.in-terminal { padding: 0; }
        .btn-back-top { display: flex; justify-content: center; width: 100%; margin-bottom: 1rem; }
        .btn-back-inline { display: none; }
    }

    /* Bestandsverlauf */
    .movements h3 { margin: 0 0 0.75rem 0; }
    .movements ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; max-height: 320px; overflow-y: auto; }
    .movements li { display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap; padding: 0.45rem 0.6rem; border-radius: 6px; background: rgba(255,255,255,0.04); border: 1px solid rgba(148,163,184,0.15); }
    .mv-delta { font-weight: 700; min-width: 3.2rem; font-variant-numeric: tabular-nums; }
    .mv-delta.plus { color: #22c55e; }
    .mv-delta.minus { color: #f87171; }
    .mv-stock { color: #cbd5e1; font-variant-numeric: tabular-nums; }
    .mv-meta { color: #94a3b8; font-size: 0.82rem; }
</style>