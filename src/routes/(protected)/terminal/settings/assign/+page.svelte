<script>
    import { assignFilterStore } from '$lib/filterStore.js';

    export let data;
    const { categories = [], articles = [], attributes = [] } = data;
    
    let rangeWarnings = {};
    let rangeWarningTimeouts = {};

    // 1. KATEGORIEN FILTERN
    $: mainCategoryOptions = categories
        .filter(cat => {
            if (!cat.subcategories || cat.subcategories.length === 0) return false;
            return cat.subcategories.some(sub => 
                articles.some(article => article.mainCategoryId === cat._id && article.subcategoryId === sub.id)
            );
        })
        .map(cat => ({ value: cat._id, label: cat.name }));

    $: selectedMainCategory = categories.find(cat => cat._id === $assignFilterStore.selectedMainCategoryId) || null;
    $: availableSubcategories = selectedMainCategory ? selectedMainCategory.subcategories : [];
    
    $: subCategoryOptions = availableSubcategories
        .filter(sub => 
            articles.some(article => article.mainCategoryId === $assignFilterStore.selectedMainCategoryId && article.subcategoryId === sub.id)
        )
        .map(sub => ({ value: sub.id, label: sub.name }));

    let previousMain = $assignFilterStore.selectedMainCategoryId;
    $: if ($assignFilterStore.selectedMainCategoryId !== previousMain) {
        $assignFilterStore.selectedSubcategoryId = "";
        previousMain = $assignFilterStore.selectedMainCategoryId;
    }

    // 2. BASIS-FILTER
    $: baseFilteredArticles = articles.filter(article => {
        const searchStr = ($assignFilterStore.searchQuery || "").toLowerCase();
        const safeTitle = article.title || "";
        const safeGtin = article.gtin || "";
        
        const matchSearch = safeTitle.toLowerCase().includes(searchStr) || 
                            safeGtin.toLowerCase().includes(searchStr);
                            
        const matchMainCategory = $assignFilterStore.selectedMainCategoryId === "" || article.mainCategoryId === $assignFilterStore.selectedMainCategoryId;
        const matchSubCategory = $assignFilterStore.selectedSubcategoryId === "" || article.subcategoryId === $assignFilterStore.selectedSubcategoryId;
        
        let matchBarcode = true;
        if ($assignFilterStore.barcodeFilter === "unassigned") matchBarcode = !article.assigned_barcode;
        if ($assignFilterStore.barcodeFilter === "assigned") matchBarcode = !!article.assigned_barcode;

        return matchSearch && matchMainCategory && matchSubCategory && matchBarcode;
    });

    // 3. DYNAMISCHE SIDEBAR-FILTER
    $: availableSidebarFilters = (() => {
        const result = [];
        attributes.forEach(attrDef => {
            const attrId = attrDef._id;
            const valueSet = new Set();
            
            const articlesForThisAttr = baseFilteredArticles.filter(article => {
                for (const [otherAttrId, selectedValues] of Object.entries($assignFilterStore.selectedAttributeFilters)) {
                    if (otherAttrId === attrId) continue; 
                    if (selectedValues && selectedValues.length > 0) {
                        const articleValue = article.attributes ? article.attributes[otherAttrId] : undefined;
                        if (articleValue === undefined) return false; 
                        if (Array.isArray(articleValue)) { 
                            if (!selectedValues.some(val => articleValue.includes(val))) return false; 
                        } else { 
                            if (!selectedValues.includes(articleValue)) return false; 
                        }
                    }
                }
                for (const [otherAttrId, range] of Object.entries($assignFilterStore.activeRangeFilters)) {
                    if (otherAttrId === attrId) continue;
                    if (!article.attributes || article.attributes[otherAttrId] === undefined) return false;
                    const val = parseFloat(String(article.attributes[otherAttrId]).replace(',', '.'));
                    if (isNaN(val) || val < range.min || val > range.max) return false;
                }
                return true;
            });

            articlesForThisAttr.forEach(article => {
                if (article.attributes && article.attributes[attrId] !== undefined && article.attributes[attrId] !== "") {
                    const val = article.attributes[attrId];
                    if (Array.isArray(val)) val.forEach(v => valueSet.add(v));
                    else valueSet.add(val);
                }
            });

            const isModalActive = $assignFilterStore.selectedAttributeFilters[attrId] && $assignFilterStore.selectedAttributeFilters[attrId].length > 0;
            const isRangeActive = $assignFilterStore.activeRangeFilters[attrId] !== undefined;

            if (valueSet.size > 1 || isModalActive || isRangeActive) {
                const optionsArr = Array.from(valueSet);
                const unitStr = attrDef.unit ? ` ${attrDef.unit}` : '';

                if (attrDef.ui_type === 'number') {
                    const numValues = optionsArr.map(v => parseFloat(String(v).replace(',', '.'))).filter(v => !isNaN(v));
                    if (numValues.length > 0) {
                        const min = Math.floor(Math.min(...numValues));
                        const max = Math.ceil(Math.max(...numValues));
                        if (min < max || $assignFilterStore.activeRangeFilters[attrId]) {
                            result.push({ id: attrId, label: attrDef.label, type: 'range', absMin: min, absMax: max, unit: unitStr });
                        }
                    }
                } else {
                    result.push({
                        id: attrId, label: attrDef.label, type: 'modal',
                        options: optionsArr.sort((a, b) => String(a).localeCompare(String(b), 'de', { sensitivity: 'base', numeric: true })),
                        unit: unitStr
                    });
                }
            }
        });

        return result.sort((a, b) => a.label.localeCompare(b.label, 'de', { sensitivity: 'base' }));
    })();

    let sidebarAttributeSearch = "";
    $: visibleSidebarFilters = availableSidebarFilters.filter(filter => 
        (filter.label || "").toLowerCase().includes((sidebarAttributeSearch || "").toLowerCase())
    );

    // 4. DETAIL-FILTER STATES & MODAL
    let activeFilterModal = null;    
    let tempSelectedOptions = [];    
    let modalSearchQuery = "";
    
    $: filteredModalOptions = activeFilterModal 
        ? activeFilterModal.options.filter(opt => String(opt || "").toLowerCase().includes((modalSearchQuery || "").toLowerCase()))
        : [];

    function openFilterModal(filter) { 
        activeFilterModal = filter; 
        tempSelectedOptions = $assignFilterStore.selectedAttributeFilters[filter.id] ? [...$assignFilterStore.selectedAttributeFilters[filter.id]] : []; 
        modalSearchQuery = ""; 
    }
    function closeFilterModal() { activeFilterModal = null; tempSelectedOptions = []; modalSearchQuery = ""; }
    function toggleTempOption(opt) { tempSelectedOptions = tempSelectedOptions.includes(opt) ? tempSelectedOptions.filter(v => v !== opt) : [...tempSelectedOptions, opt]; }
    function deselectAllTempOptions() { tempSelectedOptions = []; }
    
    function confirmFilterModal() {
        if (tempSelectedOptions.length > 0) {
            $assignFilterStore.selectedAttributeFilters[activeFilterModal.id] = [...tempSelectedOptions];
        } else {
            delete $assignFilterStore.selectedAttributeFilters[activeFilterModal.id];
        }
        $assignFilterStore.selectedAttributeFilters = { ...$assignFilterStore.selectedAttributeFilters }; 
        closeFilterModal();
    }

    function updateRange(attrId, type, rawValue, absMin, absMax, event = null) {
        let val = parseFloat(String(rawValue).replace(',', '.'));
        if (isNaN(val)) return;
        
        if (!$assignFilterStore.activeRangeFilters[attrId]) {
            $assignFilterStore.activeRangeFilters[attrId] = { min: absMin, max: absMax };
        }
        
        if (type === 'min') {
            if (val > $assignFilterStore.activeRangeFilters[attrId].max) val = $assignFilterStore.activeRangeFilters[attrId].max;
            $assignFilterStore.activeRangeFilters[attrId].min = val;
        } else {
            if (val < $assignFilterStore.activeRangeFilters[attrId].min) val = $assignFilterStore.activeRangeFilters[attrId].min;
            $assignFilterStore.activeRangeFilters[attrId].max = val;
        }
        $assignFilterStore.activeRangeFilters = { ...$assignFilterStore.activeRangeFilters };
    }

    function clearAttributeFilters() { 
        $assignFilterStore.selectedAttributeFilters = {}; 
        $assignFilterStore.activeRangeFilters = {}; 
    }
    
    function clearCategorySelection() { 
        $assignFilterStore.selectedMainCategoryId = ""; 
        $assignFilterStore.selectedSubcategoryId = ""; 
        $assignFilterStore.barcodeFilter = "all"; 
    }

    // 5. FINALES ARRAY
    $: finalFilteredArticles = baseFilteredArticles.filter(article => {
        for (const [attrId, selectedValues] of Object.entries($assignFilterStore.selectedAttributeFilters)) {
            if (selectedValues && selectedValues.length > 0) {
                const articleValue = article.attributes ? article.attributes[attrId] : undefined;
                if (articleValue === undefined) return false; 
                if (Array.isArray(articleValue)) { if (!selectedValues.some(val => articleValue.includes(val))) return false; } 
                else { if (!selectedValues.includes(articleValue)) return false; }
            }
        }
        for (const [attrId, range] of Object.entries($assignFilterStore.activeRangeFilters)) {
            if (!article.attributes || article.attributes[attrId] === undefined) return false;
            const val = parseFloat(String(article.attributes[attrId]).replace(',', '.'));
            if (isNaN(val) || val < range.min || val > range.max) return false;
        }
        return true; 
    }).sort((a, b) => {
        switch($assignFilterStore.currentSort) {
            case 'name_asc': return (a.title || "").localeCompare(b.title || "", 'de');
            case 'name_desc': return (b.title || "").localeCompare(a.title || "", 'de');
            case 'stock_desc': return (b.istBestand || 0) - (a.istBestand || 0);
            case 'stock_asc': return (a.istBestand || 0) - (b.istBestand || 0);
            default: return 0;
        }
    });
</script>

<div class="terminal-page space-grotesk">
    <div class="header">
        <h1>Artikel verknüpfen</h1>
        <a href="/terminal/settings" class="btn-back">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            Zurück
        </a>
    </div>

    <div class="top-bar">
        <div class="filter-left">
            <div class="dropdown-group">
                <label>Hauptkategorie</label>
                <select class="dark-select" bind:value={$assignFilterStore.selectedMainCategoryId}>
                    <option value="">Alle Hauptkategorien</option>
                    {#each mainCategoryOptions as opt}
                        <option value={opt.value}>{opt.label}</option>
                    {/each}
                </select>
            </div>
            
            {#if $assignFilterStore.selectedMainCategoryId && subCategoryOptions.length > 0}
                <div class="dropdown-group">
                    <label>Unterkategorie</label>
                    <select class="dark-select" bind:value={$assignFilterStore.selectedSubcategoryId}>
                        <option value="">Alle Unterkategorien</option>
                        {#each subCategoryOptions as opt}
                            <option value={opt.value}>{opt.label}</option>
                        {/each}
                    </select>
                </div>
            {/if}

            <div class="dropdown-group">
                <label>Barcode-Status</label>
                <select class="dark-select" bind:value={$assignFilterStore.barcodeFilter}>
                    <option value="all">Alle Artikel</option>
                    <option value="unassigned">Ohne Barcode (Rot)</option>
                    <option value="assigned">Mit Barcode (Grün)</option>
                </select>
            </div>

            {#if $assignFilterStore.selectedMainCategoryId || $assignFilterStore.selectedSubcategoryId || $assignFilterStore.barcodeFilter !== "all"}
                <button class="btn-clear-categories" on:click={clearCategorySelection}>✕ Auswahl aufheben</button>
            {/if}
        </div>
        
        <div class="filter-right">
            <div class="search-box">
                <label>Suchen (Titel oder GTIN)</label>
                <input type="text" bind:value={$assignFilterStore.searchQuery} placeholder="Artikelname oder Nummer..." class="dark-input" >
            </div>
        </div>
    </div>

    <div class="content-wrapper">
        <div class="sidebar-section">
            <div class="sidebar-header">
                <h3>Spezifikationen</h3>
                {#if Object.values($assignFilterStore.selectedAttributeFilters).some(arr => arr?.length > 0) || Object.keys($assignFilterStore.activeRangeFilters).length > 0}
                    <button class="btn-clear" on:click={clearAttributeFilters}>Löschen</button>
                {/if}
            </div>

            <input type="text" bind:value={sidebarAttributeSearch} placeholder="Attribut suchen..." class="dark-input sidebar-search" >

            <div class="sidebar-filters-list">
                {#each visibleSidebarFilters as filter (filter.id)}
                    <div class="filter-group">
                        <h4>{filter.label}</h4>
                        
                        {#if filter.type === 'modal'}
                            <button class="btn-open-modal" on:click={() => openFilterModal(filter)}>
                                <span>
                                    {#if $assignFilterStore.selectedAttributeFilters[filter.id]?.length > 0}
                                        <span class="badge">{$assignFilterStore.selectedAttributeFilters[filter.id].length}</span> gewählt
                                    {:else}
                                        Wählen...
                                    {/if}
                                </span>
                                <span>▼</span>
                            </button>
                        {:else if filter.type === 'range'}
                            <div class="range-inputs">
                                <input type="number" value={$assignFilterStore.activeRangeFilters[filter.id]?.min ?? filter.absMin} on:change={(e) => updateRange(filter.id, 'min', e.target.value, filter.absMin, filter.absMax)} class="dark-input range-num" >
                                <span>-</span>
                                <input type="number" value={$assignFilterStore.activeRangeFilters[filter.id]?.max ?? filter.absMax} on:change={(e) => updateRange(filter.id, 'max', e.target.value, filter.absMin, filter.absMax)} class="dark-input range-num" >
                            </div>
                        {/if}
                    </div>
                {/each}
                {#if visibleSidebarFilters.length === 0}
                    <p class="no-filters-text">Keine Filter verfügbar.</p>
                {/if}
            </div>
        </div>

        <div class="articles-section">
            <div class="results-header">
                <span class="results-info">Zeige {finalFilteredArticles.length} Artikel</span>
                <select class="dark-select sort-select" bind:value={$assignFilterStore.currentSort}>
                    <option value="name_asc">Name (A-Z)</option>
                    <option value="name_desc">Name (Z-A)</option>
                    <option value="stock_desc">Bestand absteigend</option>
                    <option value="stock_asc">Bestand aufsteigend</option>
                </select>
            </div>

            <div class="article-grid">
                {#each finalFilteredArticles as article}
                    <div class="card">
                        <div class="card-image">
                            {#if article.imagePath}
                                <img src={article.imagePath} alt={article.title} >
                            {:else}
                                <div class="no-image">Kein Bild</div>
                            {/if}
                        </div>
                        <div class="card-content">
                            <h3>{article.title}</h3>
                            <p class="stock-badge" class:low={(article.istBestand || 0) === 0}>
                                {article.istBestand ?? 0} Stk.
                            </p>

                            {#if article.assigned_barcode}
                                <div class="barcode-badge assigned">Barcode: {article.assigned_barcode}</div>
                            {:else}
                                <div class="barcode-badge unassigned">Barcode nicht zugewiesen</div>
                            {/if}

                            <a href="/terminal/settings/assign/{article._id}" class="btn-assign">
                                Artikel Barcode zuweisen
                            </a>
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    </div>
</div>

{#if activeFilterModal}
    <div class="modal-backdrop" on:click={closeFilterModal}></div>
    <div class="modal-window">
        <div class="modal-header">
            <h3>{activeFilterModal.label}</h3>
            <button class="btn-close-modal" on:click={closeFilterModal}>✕</button>
        </div>
        <div class="modal-search">
            <input type="text" bind:value={modalSearchQuery} placeholder="Suchen..." class="dark-input" >
        </div>
        <div class="modal-body">
            {#each filteredModalOptions as opt}
                <button class="modal-option" class:selected={tempSelectedOptions.includes(opt)} on:click={() => toggleTempOption(opt)}>
                    <div class="checkbox">{tempSelectedOptions.includes(opt) ? '✓' : ''}</div>
                    {opt}{activeFilterModal.unit}
                </button>
            {/each}
        </div>
        <div class="modal-footer">
            <button class="btn-secondary" on:click={deselectAllTempOptions}>Auswahl aufheben</button>
            <button class="btn-primary" on:click={confirmFilterModal}>Bestätigen</button>
        </div>
    </div>
{/if}

<style>
    :global(html), :global(body) { overflow-x: hidden; margin: 0; padding: 0; width: 100%; }
    * { box-sizing: border-box; }

    .terminal-page { max-width: 1400px; margin: 0 auto; padding: 1rem 1.5rem; color: #f8fafc; }
    
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
    h1 { color: #22c55e; margin: 0; font-size: 2.2rem; }
    
    .btn-back { display: flex; align-items: center; gap: 0.5rem; background: #1e293b; color: white; padding: 0.8rem 1.5rem; border-radius: 8px; border: 1px solid #334155; text-decoration: none; font-weight: 600; }
    
    .top-bar { background: #1e293b; padding: 1.5rem; border-radius: 12px; border: 1px solid #334155; margin-bottom: 2rem; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 1.5rem; }
    .filter-left { display: flex; gap: 1rem; flex-wrap: wrap; flex: 1; align-items: flex-end;}
    .filter-right { width: 100%; max-width: 400px; }
    .dropdown-group, .search-box { display: flex; flex-direction: column; gap: 0.4rem; flex-grow: 1; }
    label { color: #94a3b8; font-size: 0.9rem; font-weight: 600; }
    
    .dark-select, .dark-input { background: #0f172a; color: white; border: 1px solid #475569; padding: 0.8rem; border-radius: 8px; font-size: 1rem; width: 100%; outline: none; }
    .dark-select:focus, .dark-input:focus { border-color: #3b82f6; }
    
    .btn-clear-categories { background: none; border: none; color: #ef4444; cursor: pointer; padding: 0.8rem 0; font-weight: 600; }

    .content-wrapper { display: flex; gap: 2rem; align-items: flex-start; }
    
    .sidebar-section { flex: 0 0 300px; background: #1e293b; border-radius: 12px; border: 1px solid #334155; padding: 1.5rem; position: sticky; top: 1rem; max-height: calc(100vh - 2rem); overflow-y: auto; }
    .sidebar-section::-webkit-scrollbar { width: 8px; }
    .sidebar-section::-webkit-scrollbar-track { background: transparent; border-radius: 8px; }
    .sidebar-section::-webkit-scrollbar-thumb { background: #475569; border-radius: 8px; }
    .sidebar-section::-webkit-scrollbar-thumb:hover { background: #64748b; }    
    
    .sidebar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .sidebar-header h3 { margin: 0; font-size: 1.2rem; }
    .btn-clear { background: none; border: none; color: #ef4444; font-size: 0.9rem; cursor: pointer; font-weight: 600; }
    .sidebar-search { margin-bottom: 1.5rem; }
    
    .filter-group { margin-bottom: 1.5rem; }
    .filter-group h4 { margin: 0 0 0.5rem 0; color: #cbd5e1; font-size: 1rem; }
    .btn-open-modal { width: 100%; display: flex; justify-content: space-between; background: #0f172a; border: 1px solid #475569; color: white; padding: 0.8rem; border-radius: 8px; cursor: pointer; }
    .badge { background: #3b82f6; padding: 0.1rem 0.4rem; border-radius: 12px; font-size: 0.8rem; }
    
    .range-inputs { display: flex; align-items: center; gap: 0.5rem; }
    .range-num { text-align: center; }

    .articles-section { flex: 1; min-width: 0;}
    .results-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    .results-info { color: #94a3b8; font-weight: 600; }
    .sort-select { width: auto; min-width: 200px; }

    .article-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; }    
    
    .card { background: #1e293b; border: 2px solid #334155; border-radius: 12px; display: flex; flex-direction: column; text-align: left; padding: 0; overflow: hidden; color: white; height: 100%; }
    .card-image { height: 200px; background: white; display: flex; justify-content: center; align-items: center; border-bottom: 1px solid #334155; }
    .card-image img { width: 100%; height: 100%; object-fit: contain; padding: 1.5rem; }
    .no-image { color: #94a3b8; font-size: 1.2rem; }
    
    .card-content { padding: 1.5rem; display: flex; flex-direction: column; gap: 0.8rem; flex-grow: 1; }
    .card-content h3 { margin: 0; font-size: 1.15rem; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

    .stock-badge { align-self: flex-start; margin: 0; background: rgba(34, 197, 94, 0.2); color: #86efac; border: 1px solid #22c55e; padding: 0.4rem 0.8rem; border-radius: 6px; font-weight: bold; font-size: 1.1rem; }
    .stock-badge.low { background: rgba(239, 68, 68, 0.2); color: #fca5a5; border-color: #ef4444; }

    .barcode-badge { padding: 0.5rem; border-radius: 6px; font-weight: bold; font-size: 0.95rem; text-align: center; }
    .barcode-badge.assigned { background: rgba(34, 197, 94, 0.1); color: #4ade80; border: 1px solid #22c55e; }
    .barcode-badge.unassigned { background: rgba(239, 68, 68, 0.1); color: #f87171; border: 1px dashed #ef4444; }

    .btn-assign { margin-top: auto; background: #38bdf8; color: #0f172a; border: none; padding: 1rem; border-radius: 8px; font-weight: bold; font-size: 1rem; text-align: center; text-decoration: none; display: block; transition: background 0.2s; width: 100%; }
    .btn-assign:hover { background: #0ea5e9; }

    .modal-backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 1000; }
    .modal-window { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #1e293b; border: 1px solid #475569; width: 90%; max-width: 500px; max-height: 80vh; display: flex; flex-direction: column; border-radius: 12px; z-index: 1001; }
    .modal-header { display: flex; justify-content: space-between; padding: 1.5rem; border-bottom: 1px solid #334155; }
    .modal-header h3 { margin: 0; }
    .btn-close-modal { background: none; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer; }
    .modal-search { padding: 1rem; }
    .modal-body { padding: 1rem; overflow-y: auto; flex-grow: 1; display: flex; flex-direction: column; gap: 0.5rem; }
    .modal-option { display: flex; align-items: center; gap: 1rem; padding: 1rem; background: #0f172a; border: 1px solid #334155; color: white; border-radius: 8px; cursor: pointer; text-align: left; }
    .modal-option.selected { border-color: #3b82f6; background: rgba(59, 130, 246, 0.1); }
    .checkbox { width: 20px; height: 20px; border: 1px solid #475569; display: flex; justify-content: center; align-items: center; border-radius: 4px; }
    .modal-option.selected .checkbox { background: #3b82f6; border-color: #3b82f6; }
    .modal-footer { display: flex; justify-content: space-between; padding: 1.5rem; border-top: 1px solid #334155; }
    .btn-secondary { background: transparent; color: #ef4444; border: none; cursor: pointer; font-weight: bold; }
    .btn-primary { background: #3b82f6; color: white; border: none; padding: 0.8rem 1.5rem; border-radius: 8px; font-weight: bold; cursor: pointer; }

    @media (max-width: 1024px) {
        .article-grid { grid-template-columns: repeat(2, 1fr); }
    }
</style>