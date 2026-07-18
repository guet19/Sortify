<script>
    import { onDestroy, tick, onMount } from "svelte";
    import { browser } from "$app/environment";
    import { enhance } from "$app/forms";
    import SearchableSelect from "$lib/components/SearchableSelect.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation"; 

    import "cropperjs/dist/cropper.css";
    import Cropper from "cropperjs";

    export let data;
    export let form;

    // 🔥 NEU: copiedArticle aus den data entpacken
    const { categories, attributes, copiedArticle } = data;

    // --- State Management ---
    let title = "";
    let description = "";
    let supplier = "";
    let gtin = ""; 
    let price = "";
    let orderLink = "";
    let importUrl = "";
    let isExtracting = false;

    let totalPackPrice = "";
    let packQuantity = "";
    
    let istBestand = "";

    $: if (totalPackPrice && packQuantity && parseFloat(packQuantity) > 0) {
        price = (parseFloat(totalPackPrice) / parseFloat(packQuantity)).toFixed(2);
    }

    let rawImportText = "";
    let importedImageUrl = "";
    let attributeValues = {};

    let selectedMainCategoryId = "";
    let selectedSubcategoryId = "";

    let formErrors = {};
    let showSuccessMessage = false;

    let numberWarnings = {};
    let warningTimeouts = {};

    // --- Echtzeit-Fehlerbereinigung ---
    $: if (selectedMainCategoryId) formErrors.mainCategory = false;
    $: if (selectedSubcategoryId) formErrors.subCategory = false;
    $: if (title && title.trim() !== "") formErrors.title = false;
    $: if (istBestand !== null && istBestand !== undefined && istBestand.toString().trim() !== "") formErrors.istBestand = false;

    // --- Bookmarklet & KI Workflow States ---
    let isFromBookmarklet = false;
    let aiChoiceMade = false;
    let showAIPrompt = false;
    let showAIWarning = false;

    // Kategorien-Logik
    $: mainCategoryOptions = categories
        .filter((cat) => cat.subcategories && cat.subcategories.length > 0)
        .map((cat) => ({ value: cat._id, label: cat.name }));

    $: selectedMainCategory = categories.find((cat) => cat._id === selectedMainCategoryId) || null;
    $: availableSubcategories = selectedMainCategory ? selectedMainCategory.subcategories : [];
    $: subCategoryOptions = availableSubcategories.map((sub) => ({ value: sub.id, label: sub.name }));

    $: selectedSubcategory = availableSubcategories.find((sub) => sub.id === selectedSubcategoryId) || null;
    $: activeAttributes = selectedSubcategory
        ? attributes.filter((attr) => selectedSubcategory.allowed_attributes.includes(attr._id)).sort((a, b) => a.label.localeCompare(b.label, 'de', { sensitivity: 'base' }))
        : [];

    // 🔥 NEU: onMount für das automatische Ausfüllen der Kopie
    onMount(async () => {
        if (copiedArticle) {
            title = copiedArticle.title ? `${copiedArticle.title} (Kopie)` : "";
            description = copiedArticle.description || "";
            supplier = copiedArticle.supplier || "";
            gtin = copiedArticle.gtin || "";
            price = copiedArticle.price || "";
            orderLink = copiedArticle.orderLink || "";
            istBestand = 0; // Bei einer Kopie startet der Bestand meistens bei 0
            
            selectedMainCategoryId = copiedArticle.mainCategoryId || "";
            
            // Warten, bis Svelte das Unterkategorien-Dropdown gerendert hat
            await tick();
            selectedSubcategoryId = copiedArticle.subcategoryId || "";
            
            if (copiedArticle.attributes) {
                attributeValues = { ...copiedArticle.attributes };
            }

            // Wenn der Originalartikel ein Bild hatte, laden wir es direkt in den Cropper!
            if (copiedArticle.imagePath) {
                await loadExternalImage(copiedArticle.imagePath);
            }
        }
    });

    // --- REAKTIVER URL-IMPORT (Bookmarklet Empfang) ---
    $: {
        const urlParams = $page.url.searchParams;
        const urlTitle = urlParams.get("title");
        const urlSource = urlParams.get("url");
        const urlDesc = urlParams.get("desc");
        const urlImg = urlParams.get("img"); 

        if (urlTitle || urlSource || urlDesc || urlImg) {
            isFromBookmarklet = true;
        }

        if (urlTitle && !title && !copiedArticle) title = urlTitle;
        if (urlSource && !orderLink) {
            orderLink = urlSource;
            importUrl = orderLink;
            rawImportText = urlDesc || "";
        }
        if (urlImg && !importedImageUrl) {
            importedImageUrl = urlImg;
        }
    }

    $: if (isFromBookmarklet && !aiChoiceMade) {
        showAIPrompt = !!(selectedMainCategoryId && selectedSubcategoryId);
    }

    function acceptAI() {
        showAIPrompt = false;
        aiChoiceMade = true;
        handleEnhancedImport();
    }

    function declineAI() {
        showAIPrompt = false;
        aiChoiceMade = true;
    }

    async function handleEnhancedImport() {
        isExtracting = true;
        try {
            const res = await fetch("/api/extract-article", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    html: rawImportText || importUrl,
                    url: orderLink,
                    expectedAttributes: activeAttributes.map((a) => ({
                        id: a._id,
                        name: a.label,
                        ui_type: a.ui_type,
                        unit: a.unit || "", 
                        options: a.options || [],
                    })),
                }),
            });

            const result = await res.json();
            if (res.ok) {
                if (result.title) title = result.title;
                if (result.description) description = result.description;
                if (result.supplier) supplier = result.supplier;
                if (result.gtin) gtin = result.gtin;
                if (result.totalPackPrice) totalPackPrice = result.totalPackPrice;
                if (result.packQuantity) packQuantity = result.packQuantity;
                
                if (result.price && !result.totalPackPrice) {
                    price = result.price;
                }

                if (result.specs) {
                    attributeValues = { ...attributeValues, ...result.specs };
                }

                const imageToLoad = importedImageUrl || result.finalImageUrl;
                if (imageToLoad && !imagePreview) {
                    await loadExternalImage(imageToLoad);
                }
            }
        } catch (error) {
            console.error("KI Fehler:", error);
            if (browser) alert("Fehler bei der KI-Analyse.");
        } finally {
            isExtracting = false;
            showAIWarning = true;
        }
    }

    function handleNumberInput(event, attrId) {
        const originalValue = event.target.value;
        const sanitizedValue = originalValue.replace(/[^0-9.,]/g, '');
        
        if (originalValue !== sanitizedValue) {
            event.target.value = sanitizedValue; 
            
            numberWarnings[attrId] = true;
            numberWarnings = { ...numberWarnings }; 
            
            if (warningTimeouts[attrId]) clearTimeout(warningTimeouts[attrId]);
            
            warningTimeouts[attrId] = setTimeout(() => {
                numberWarnings[attrId] = false;
                numberWarnings = { ...numberWarnings };
            }, 3000);
        }
        attributeValues[attrId] = sanitizedValue;
    }

    let fileInputElement;
    let imagePreview = null;
    let isCropping = false;
    let cropperImageEl;
    let cropperInstance = null;
    let croppedFileBlob = null;

    async function handleImageSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        imagePreview = URL.createObjectURL(file);
        isCropping = true;
        await tick();
        if (cropperInstance) cropperInstance.destroy();
        cropperInstance = new Cropper(cropperImageEl, { aspectRatio: 4 / 3, viewMode: 2, background: false, zoomable: false });
    }

    async function loadExternalImage(imageUrl) {
        try {
            if (imageUrl.startsWith("data:image") || imageUrl.startsWith("blob:")) {
                const response = await fetch(imageUrl);
                const blob = await response.blob();
                processImageBlob(blob);
                return;
            }
            const proxyUrl = `/api/fetch-image?url=${encodeURIComponent(imageUrl)}`;
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error("Interner Proxy fehlgeschlagen");
            const blob = await response.blob();
            processImageBlob(blob);
        } catch (error) {
            console.error("Bild blockiert:", error);
        }
    }

    async function processImageBlob(blob) {
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        imagePreview = URL.createObjectURL(blob);
        isCropping = true;
        await tick();
        if (cropperInstance) cropperInstance.destroy();
        cropperInstance = new Cropper(cropperImageEl, { aspectRatio: 4 / 3, viewMode: 2, background: false, zoomable: false });
    }

    function applyCrop() {
        if (!cropperInstance) return;
        const canvas = cropperInstance.getCroppedCanvas({ width: 1200, height: 900 }); 
        canvas.toBlob((blob) => {
            croppedFileBlob = blob;
            if (imagePreview) URL.revokeObjectURL(imagePreview);
            imagePreview = URL.createObjectURL(blob);
            cropperInstance.destroy(); cropperInstance = null; isCropping = false;
        }, "image/jpeg", 0.85);
    }

    function cancelCrop() {
        if (cropperInstance) cropperInstance.destroy();
        isCropping = false; imagePreview = null; croppedFileBlob = null;
        if (fileInputElement) fileInputElement.value = "";
    }

    onDestroy(() => {
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        if (cropperInstance) cropperInstance.destroy();
    });
</script>

{#if isExtracting || showAIWarning}
    <div class="modal-fullscreen-backdrop"></div>
{/if}

{#if isExtracting}
    <div class="overlay-modal">
        <div class="spinner"></div>
        <p class="modal-text">Daten werden ausgelesen und zugeordnet.<br>Bitte warten....</p>
    </div>
{/if}

{#if showAIWarning}
    <div class="overlay-modal">
        <div class="warning-icon">⚠️</div>
        <p class="modal-text">KI kann Fehler machen, bitte überprüfen Sie die zugewiesenen Informationen!</p>
        <button type="button" class="btn-confirm-warning" on:click={() => showAIWarning = false}>Bestätigen</button>
    </div>
{/if}

<div class="page-container space-grotesk">
    <h1>{copiedArticle ? 'Artikel kopieren' : 'Neuen Artikel anlegen'}</h1>

    {#if showSuccessMessage || form?.success}
        <div class="alert success">{form?.message || "Artikel erfolgreich gespeichert!"}</div>
    {/if}
    {#if form?.error}
        <div class="alert error">{form.error}</div>
    {/if}
    {#if copiedArticle}
        <div class="alert" style="background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe;">
            ℹ️ Die Daten wurden aus dem kopierten Artikel übernommen. Du kannst sie jetzt bearbeiten und als neuen Artikel speichern.
        </div>
    {/if}

    <form
        method="POST"
        class="article-form"
        enctype="multipart/form-data"
        novalidate
        use:enhance={({ formData, cancel }) => {
            formErrors = {};
            let hasError = false;

            if (!selectedMainCategoryId) { formErrors.mainCategory = true; hasError = true; }
            if (!selectedSubcategoryId) { formErrors.subCategory = true; hasError = true; }
            
            if (!title.trim()) { formErrors.title = true; hasError = true; }
            if (!description.trim()) { formErrors.description = true; hasError = true; }
            if (!formData.get("istBestand") || formData.get("istBestand").toString().trim() === "") { formErrors.istBestand = true; hasError = true; }
            
            if (hasError) {
                cancel();
                setTimeout(() => {
                    const firstErrorElement = document.querySelector('.error-highlight');
                    if (firstErrorElement) firstErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 50);
                return;
            }

            if (croppedFileBlob) formData.set("image", croppedFileBlob, "article.jpg");

            return async ({ result, update }) => {
                if (result.type === "success") {
                    goto("/?success=true");
                } else {
                    await update();
                }
            };
        }}
    >
        <div class="form-section">
            <h2>1. Kategorisierung festlegen</h2>
            
            {#if mainCategoryOptions.length === 0}
                <div class="alert error" style="margin-bottom: 0;">
                    <strong>Keine Kategorien verfügbar!</strong> Bitte legen Sie zuerst in den Einstellungen eine Hauptkategorie inkl. Unterkategorie an, um Artikel speichern zu können.
                </div>
            {:else}
                <div class="form-group tooltip-container">
                    <span class="label-text">Hauptkategorie *</span>
                    <div class="select-wrapper" class:error-highlight={formErrors.mainCategory || (isFromBookmarklet && !aiChoiceMade && !selectedMainCategoryId)}>
                        <!-- 🔥 WICHTIG: on:change anstatt reaktives Statement, damit Kopie nicht gelöscht wird -->
                        <select 
                            name="mainCategoryId" 
                            class="standard-select" 
                            bind:value={selectedMainCategoryId}
                            on:change={() => { selectedSubcategoryId = ""; attributeValues = {}; }}
                        >
                            <option value="" disabled selected>Wählen...</option>
                            {#each mainCategoryOptions as opt}
                                <option value={opt.value}>{opt.label}</option>
                            {/each}
                        </select>
                    </div>
                    {#if formErrors.mainCategory || (isFromBookmarklet && !aiChoiceMade && !selectedMainCategoryId)}
                        <div class="info-bubble">Bitte auswählen</div>
                    {/if}
                </div>

                {#if selectedMainCategoryId}
                    <div class="form-group tooltip-container">
                        <span class="label-text">Unterkategorie *</span>
                        <div class="select-wrapper" class:error-highlight={formErrors.subCategory || (isFromBookmarklet && !aiChoiceMade && selectedMainCategoryId && !selectedSubcategoryId)}>
                            <select name="subcategoryId" class="standard-select" bind:value={selectedSubcategoryId}>
                                <option value="" disabled selected>Wählen...</option>
                                {#each subCategoryOptions as opt}
                                    <option value={opt.value}>{opt.label}</option>
                                {/each}
                            </select>
                        </div>
                        {#if formErrors.subCategory || (isFromBookmarklet && !aiChoiceMade && selectedMainCategoryId && !selectedSubcategoryId)}
                            <div class="info-bubble">Bitte auswählen</div>
                        {/if}
                    </div>
                {/if}
            {/if}
        </div>

        {#if showAIPrompt}
            <div class="ai-prompt-box">
                <h3>Möchten Sie mit Hilfe der Webseitdaten automatisch ein Produkt anlegen?</h3>
                <div class="ai-prompt-actions">
                    <button type="button" class="btn-ai-yes" on:click={acceptAI}>Ja</button>
                    <button type="button" class="btn-ai-no" on:click={declineAI}>Produktdaten manuell ausfüllen</button>
                </div>
            </div>
        {/if}

        <div class="form-section" style={isFromBookmarklet && !aiChoiceMade ? "opacity: 0.5; pointer-events: none;" : ""}>
            <h2>Allgemeine Informationen</h2>
            
            <div class="form-group tooltip-container">
                <label for="title" class="label-text">Artikelbezeichnung *</label>
                <input type="text" id="title" name="title" bind:value={title} class:error-highlight={formErrors.title} placeholder="z.B. Schraube M4x20" required />
                {#if formErrors.title}
                    <div class="info-bubble">Bitte ausfüllen</div>
                {/if}
            </div>

            <div class="form-group tooltip-container">
                <label for="description" class="label-text">Beschreibung *</label>
                <textarea id="description" name="description" bind:value={description} rows="6" class:error-highlight={formErrors.description} placeholder="Genaue Beschreibung des Artikels..." required></textarea>
                {#if formErrors.description}
                    <div class="info-bubble">Bitte ausfüllen</div>
                {/if}
            </div>

            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.2rem;">
                <div class="form-group tooltip-container" style="margin-bottom: 0;">
                    <label for="istBestand" class="label-text">Ist-Bestand *</label>
                    <input type="number" id="istBestand" name="istBestand" min="0" bind:value={istBestand} class:error-highlight={formErrors.istBestand} required />
                    {#if formErrors.istBestand}
                        <div class="info-bubble">Bitte ausfüllen</div>
                    {/if}
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                    <label for="sollBestand" class="label-text">Soll-Bestand</label>
                    <input type="number" id="sollBestand" name="sollBestand" min="0" value={copiedArticle?.sollBestand || ''} />
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                    <label for="mindestBestand" class="label-text">Mindestbestand</label>
                    <input type="number" id="mindestBestand" name="mindestBestand" min="0" value={copiedArticle?.mindestBestand || ''} />
                </div>
            </div>

            <div class="attributes-grid">
                <div class="form-group">
                    <label for="supplier" class="label-text">Lieferant</label>
                    <input type="text" id="supplier" name="supplier" bind:value={supplier} />
                </div>
                <div class="form-group">
                    <label for="gtin" class="label-text">GTIN / EAN / Art.Nr.</label>
                    <input type="text" id="gtin" name="gtin" bind:value={gtin} />
                </div>
                
                <div class="form-group">
                    <label for="price" class="label-text">Preis pro Stück (CHF)</label>
                    <input type="number" id="price" name="price" step="0.01" bind:value={price} />
                    
                    <div style="margin-top: 0.4rem; padding: 0.5rem; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; display: flex; flex-direction: column; gap: 0.3rem;">
                        <span style="font-size: 0.75rem; font-weight: 600; color: #64748b;">Packungs-Rechner (optional):</span>
                        <div style="display: flex; gap: 0.4rem;">
                            <input type="number" placeholder="Gesamtpreis" step="0.01" bind:value={totalPackPrice} style="font-size: 0.8rem; padding: 0.3rem; height: auto;" />
                            <input type="number" placeholder="Anzahl Stk." min="1" bind:value={packQuantity} style="font-size: 0.8rem; padding: 0.3rem; height: auto;" />
                        </div>
                    </div>
                </div>
            </div>

            <div class="form-group" style="margin-top: 1rem;">
                <label for="orderLink" class="label-text">Bestelllink</label>
                <input type="url" id="orderLink" name="orderLink" bind:value={orderLink} placeholder="https://..." />
            </div>

            <div class="image-area">
                <span class="label-text">Artikelbild (4:3)</span>

                {#if !isCropping && !imagePreview}
                    <div class="file-upload-wrapper" style="margin-top: 0.5rem;">
                        <input type="file" id="image" accept="image/*" bind:this={fileInputElement} on:change={handleImageSelect} />
                    </div>
                {/if}

                {#if isCropping}
                    <div class="crop-editor-box" style="margin-top: 1rem; border: 1px solid #e2e8f0; padding: 1rem; border-radius: 8px; background: #f8fafc;">
                        <div class="image-workspace" style="margin-bottom: 1rem;">
                            <img bind:this={cropperImageEl} src={imagePreview} alt="Zuschneiden" />
                        </div>
                        <div class="cropper-actions" style="display: flex; gap: 1rem; justify-content: flex-end;">
                            <button type="button" class="btn-cancel" on:click={cancelCrop}>Abbrechen</button>
                            <button type="button" class="btn-apply" on:click={applyCrop}>Speichern</button>
                        </div>
                    </div>
                {/if}

                {#if imagePreview && !isCropping}
                    <div class="preview-wrap" style="margin-top: 1rem;">
                        <img src={imagePreview} alt="Vorschau" class="final-preview" />
                        <button type="button" class="btn-remove" on:click={cancelCrop}>Bild löschen</button>
                    </div>
                {/if}
            </div>
        </div>

        {#if activeAttributes.length > 0}
            <div class="form-section" style={isFromBookmarklet && !aiChoiceMade ? "opacity: 0.5; pointer-events: none;" : ""}>
                <h2>Spezifikationen</h2>
                <div class="attributes-grid">
                    {#each activeAttributes as attr}
                        <div class="form-group">
                            <span class="label-text">{attr.label}</span>
                            {#if attr.ui_type === "select"}
                                <div>
                                    <SearchableSelect
                                        name="attr_{attr._id}"
                                        options={(attr.options || []).map((o) => ({ value: o, label: o }))}
                                        multiple={attr.is_multiple}
                                        bind:value={attributeValues[attr._id]}
                                    />
                                </div>
                            {:else}
                                <div class="tooltip-container" style="display: flex; flex-direction: column; gap: 0.3rem;">
                                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                                        {#if attr.ui_type === "number"}
                                            <input
                                                type="text"
                                                inputmode="decimal"
                                                id="attr_{attr._id}"
                                                name="attr_{attr._id}"
                                                bind:value={attributeValues[attr._id]}
                                                on:input={(e) => handleNumberInput(e, attr._id)}
                                                class:error-highlight={numberWarnings[attr._id]}
                                                style="flex-grow: 1; transition: all 0.2s;"
                                            />
                                        {:else}
                                            <input
                                                type="text"
                                                id="attr_{attr._id}"
                                                name="attr_{attr._id}"
                                                bind:value={attributeValues[attr._id]}
                                                style="flex-grow: 1;"
                                            />
                                        {/if}

                                        {#if attr.unit}
                                            <span style="color: #64748b; font-weight: 600; font-size: 0.95rem; white-space: nowrap;">
                                                {attr.unit}
                                            </span>
                                        {/if}
                                    </div>
                                    
                                    {#if attr.ui_type === "number" && numberWarnings[attr._id]}
                                        <div class="warning-bubble">Nur Zahlen, Punkt oder Komma!</div>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        <div class="form-actions">
            <button type="submit" class="btn-submit" disabled={isExtracting || mainCategoryOptions.length === 0}>
                {copiedArticle ? 'Kopie speichern' : 'Artikel in Datenbank speichern'}
            </button>
        </div>
    </form>
</div>

<style>
    /* Generelles Layout - Helles Theme */
    ::placeholder { color: #94a3b8; opacity: 1; }

    .page-container { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; color: #334155; }
    h1 { color: #22c55e; margin-bottom: 2rem; font-size: 1.8rem; }
    h2 { font-size: 1.1rem; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.5rem; margin-bottom: 1.5rem; font-weight: 700; }
    
    .form-section { background: #ffffff; padding: 1.5rem; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 2rem; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05); transition: opacity 0.3s; }
    .form-group { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.2rem; }
    .attributes-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.2rem; }

    /* Tooltips und Blasen */
    .tooltip-container { position: relative !important; overflow: visible !important; }
    
    .info-bubble {
        position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%);
        background-color: #3b82f6; color: white; padding: 5px 10px; border-radius: 6px;
        font-size: 0.75rem; font-weight: 700; white-space: nowrap; z-index: 999;
        box-shadow: 0 4px 10px rgba(59, 130, 246, 0.3); pointer-events: none;
        animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    }
    .info-bubble::after {
        content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
        border-width: 5px; border-style: solid; border-color: #3b82f6 transparent transparent transparent;
    }

    .warning-bubble {
        position: absolute; bottom: calc(100% + 4px); left: 50%; transform: translateX(-50%);
        background-color: #ef4444; color: white; padding: 5px 9px; border-radius: 6px;
        font-size: 0.75rem; font-weight: 700; white-space: nowrap; z-index: 999;
        box-shadow: 0 4px 10px rgba(239, 68, 68, 0.25); pointer-events: none;
        animation: popIn 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    }
    .warning-bubble::after {
        content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
        border-width: 5px; border-style: solid; border-color: #ef4444 transparent transparent transparent;
    }

    @keyframes popIn {
        0% { opacity: 0; transform: translate(-50%, 4px) scale(0.93); }
        100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
    }

    /* NEU: Stylisches Dropdown für Haupt- und Unterkategorie */
    .standard-select {
        appearance: none;
        padding: 0.6rem 2.5rem 0.6rem 0.6rem;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        font-size: 1rem;
        width: 100%;
        box-sizing: border-box;
        background-color: #ffffff;
        color: #334155;
        cursor: pointer;
        transition: all 0.2s;
        /* Custom Dropdown Arrow */
        background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E");
        background-repeat: no-repeat;
        background-position: right 0.8rem top 50%;
        background-size: 0.65rem auto;
    }
    .standard-select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1); }
    .standard-select:disabled { background-color: #f8fafc; cursor: not-allowed; opacity: 0.7; }

    /* Rote Error Rahmen im Light Theme */
    .error-highlight,
    .select-wrapper.error-highlight select,
    .select-wrapper.error-highlight :global(input),
    .select-wrapper.error-highlight :global(div) {
        border-color: #ef4444 !important;
        background-color: #fef2f2 !important;
        transition: all 0.3s ease;
    }
    .error-highlight,
    .select-wrapper.error-highlight {
        box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2) !important;
        border-radius: 6px;
    }

    .select-wrapper { border-radius: 6px; transition: all 0.3s; }

    /* AI Prompt Box Styling Light Mode */
    .ai-prompt-box {
        background: #eff6ff; border: 2px solid #3b82f6; padding: 1.5rem; border-radius: 12px;
        margin-bottom: 2rem; text-align: center; box-shadow: 0 4px 15px rgba(59, 130, 246, 0.1);
        animation: slideDown 0.3s ease-out;
    }
    .ai-prompt-box h3 { color: #1e40af; margin-top: 0; margin-bottom: 1.5rem; font-size: 1.15rem; }
    .ai-prompt-actions { display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap; }
    
    .btn-ai-yes { background: #22c55e; color: white; border: none; padding: 0.8rem 2rem; border-radius: 8px; font-weight: bold; font-size: 1rem; cursor: pointer; transition: background 0.2s; }
    .btn-ai-yes:hover { background: #16a34a; }
    
    .btn-ai-no { background: #94a3b8; color: white; border: none; padding: 0.8rem 1.5rem; border-radius: 8px; font-weight: bold; font-size: 1rem; cursor: pointer; transition: background 0.2s; }
    .btn-ai-no:hover { background: #64748b; }

    @keyframes slideDown { 0% { opacity: 0; transform: translateY(-10px); } 100% { opacity: 1; transform: translateY(0); } }

    /* Overlays (Laden & Warnung) */
    .modal-fullscreen-backdrop {
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(2px); z-index: 10000;
    }
    .overlay-modal {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; width: 90%; max-width: 400px; padding: 2.5rem 2rem;
        text-align: center; z-index: 10001; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
        animation: popIn 0.2s ease-out forwards;
    }
    .modal-text { font-size: 1.1rem; color: #1e293b; font-weight: 600; margin: 0; line-height: 1.5; }
    .warning-icon { font-size: 3rem; margin-bottom: 1rem; }
    
    .spinner {
        width: 45px; height: 45px; margin: 0 auto 1.5rem auto;
        border: 4px solid #f1f5f9; border-top: 4px solid #3b82f6;
        border-radius: 50%; animation: spin 1s linear infinite;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

    .btn-confirm-warning {
        background: #3b82f6; color: white; border: none; padding: 0.8rem 2rem;
        border-radius: 8px; font-weight: bold; cursor: pointer; margin-top: 1.5rem; font-size: 1rem;
    }
    .btn-confirm-warning:hover { background: #2563eb; }

    /* Standard Formular-Styling Light Mode */
    .label-text { font-size: 0.85rem; font-weight: 600; color: #64748b; }
    input, textarea { 
        padding: 0.6rem; border: 1px solid #cbd5e1; border-radius: 6px; 
        font-size: 1rem; width: 100%; box-sizing: border-box; 
        background: #ffffff; color: #334155; transition: all 0.2s;
    }
    input:focus, textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1); }
    
    .image-area { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; }
    
    .crop-editor-box { width: 100%; display: flex; flex-direction: column; gap: 1rem; overflow: hidden; }
    .image-workspace { width: 100%; max-width: 100%; max-height: 400px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; margin-bottom: 1rem; display: flex; justify-content: center; align-items: center; }
    .image-workspace img { display: block; max-width: 100%; height: auto; }
    
    .cropper-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
    .btn-apply { background: #22c55e; color: white; border: none; padding: 0.6rem 1.2rem; border-radius: 6px; cursor: pointer; font-weight: 600; transition: background 0.2s;}
    .btn-apply:hover { background: #16a34a; }
    
    .btn-cancel { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; padding: 0.6rem 1.2rem; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;}
    .btn-cancel:hover { background: #e2e8f0; }
    
    .final-preview { max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #e2e8f0; }
    
    .btn-remove { display: block; margin-top: 0.5rem; background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 600; transition: all 0.2s;}
    .btn-remove:hover { background: #fecaca; }
    
    .btn-submit { 
        background: #3b82f6; 
        color: white; 
        padding: 1rem; 
        border: none; 
        border-radius: 8px; 
        font-weight: 700; 
        cursor: pointer; 
        width: 100%; 
        font-size: 1rem; 
        transition: background 0.2s;
    }
    .btn-submit:hover:not(:disabled) { 
        background: #2563eb; 
    }
    .btn-submit:disabled { 
        background: #94a3b8; 
        cursor: not-allowed; 
    }
    
    .alert { padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; text-align: center; font-weight: 600; }
    .success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .error { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
</style>