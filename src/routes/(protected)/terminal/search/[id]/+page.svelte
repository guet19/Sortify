<script>
    import { enhance } from '$app/forms'; 
    import { beforeNavigate } from '$app/navigation';
    import { onDestroy } from 'svelte';

    export let data;
    const { article, categories, attributes } = data;

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

    let originalStock = article.istBestand || 0;

    // --- 3. Terminal Hardware Logik (Form State & Sicherheit) ---
    let commandSent = false;

    // Sicherheitsfunktion: Schaltet die LED sofort aus
    async function stopHardware() {
        try {
            const formData = new FormData();
            await fetch('?/turnOffLED', { method: 'POST', body: formData });
        } catch (error) {
            console.error("Fehler beim Stoppen der LED:", error);
        }
    }

    // Wenn der Nutzer auf "Zurück" klickt oder die Seite wechselt
    beforeNavigate(() => {
        if (commandSent) stopHardware();
    });

    // Wenn die Komponente hart beendet wird
    onDestroy(() => {
        if (typeof window !== 'undefined' && commandSent) {
            stopHardware();
        }
    });
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
        
        <a href="/terminal/search" class="btn-back">
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            Zurück zur Suche
        </a>
    </div>

    <div class="article-layout">
        
        <div class="left-column">
            <div class="image-section">
                {#if article.imagePath}
                    <img src={article.imagePath} alt={article.title} class="main-image" />
                {:else}
                    <div class="no-image-placeholder">
                        <span>Kein Artikelbild vorhanden</span>
                    </div>
                {/if}
            </div>

            <form method="POST" action="?/triggerLED" use:enhance={() => {
                commandSent = true;
                return async ({ update }) => {
                    // NEU: Der Button bleibt nun exakt 10 Sekunden im "Aktiv"-Zustand
                    setTimeout(() => { commandSent = false; }, 10000);
                    
                    await update({ reset: false });
                };
            }}>
                <input type="hidden" name="barcode" value={article.assigned_barcode} />
                
                <button 
                    type="submit" 
                    class="hardware-trigger-btn {commandSent ? 'active' : ''}" 
                    disabled={commandSent || !article.assigned_barcode}
                >
                    <span class="icon">{commandSent ? '✓' : '💡'}</span>
                    {#if !article.assigned_barcode}
                        Kein Platz zugewiesen
                    {:else if commandSent}
                        Fach leuchtet für 10s!
                    {:else}
                        Fach leuchten lassen
                    {/if}
                </button>
            </form>
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
                <span class="label">Lagerplatz (Barcode)</span>
                <span class="value" style="color: {article.assigned_barcode ? '#ffffff' : '#94a3b8'};">
                    {article.assigned_barcode ? article.assigned_barcode : 'Unbekannt'}
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

    /* Hardware Button Styles */
    form { width: 100%; }
    .hardware-trigger-btn { 
        width: 100%; background: #3b82f6; color: white; border: none; 
        padding: 2.5rem 2rem; border-radius: 16px; font-size: 1.5rem; 
        font-weight: bold; cursor: pointer; display: flex; justify-content: center; 
        align-items: center; gap: 1rem; transition: all 0.2s; 
        box-shadow: 0 8px 20px rgba(59, 130, 246, 0.25); 
    }
    .hardware-trigger-btn:hover:not(:disabled) { background: #2563eb; transform: translateY(-3px); }
    .hardware-trigger-btn:disabled { background: #334155; color: #94a3b8; cursor: not-allowed; box-shadow: none; }
    .hardware-trigger-btn.active { background: #22c55e; transform: scale(0.98); box-shadow: 0 4px 15px rgba(34, 197, 94, 0.4); color: white; }
    .hardware-trigger-btn .icon { font-size: 2.5rem; }

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
    .drawer-highlight .value { font-size: 3rem; font-weight: bold; }

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

    @media (max-width: 1024px) {
        .article-layout { flex-direction: column; }
        .left-column { flex: auto; width: 100%; position: static; }
        .image-section { height: 350px; }
        .header { flex-direction: column; align-items: flex-start; gap: 1.5rem; }
        .btn-back { align-self: flex-start; width: 100%; justify-content: center; }
    }
</style>