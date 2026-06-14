<script>
    import { onDestroy, tick } from "svelte";
    import { browser } from "$app/environment";
    import { enhance } from "$app/forms";
    import { goto } from "$app/navigation";
    import SearchableSelect from "$lib/components/SearchableSelect.svelte";

    import "cropperjs/dist/cropper.css";
    import Cropper from "cropperjs";

    export let data;
    export let form;

    const { article, categories, attributes } = data;

    // --- State Management (Vorausgefüllt mit Artikel-Daten) ---
    let title = article.title || "";
    let description = article.description || "";
    let supplier = article.supplier || "";
    let gtin = article.gtin || ""; 
    let price = article.price || "";
    let orderLink = article.orderLink || "";
    
    let istBestand = article.istBestand !== undefined ? article.istBestand : "";
    let sollBestand = article.sollBestand !== undefined ? article.sollBestand : "";
    let mindestBestand = article.mindestBestand !== undefined ? article.mindestBestand : "";

    let attributeValues = article.attributes ? JSON.parse(JSON.stringify(article.attributes)) : {};

    let selectedMainCategoryId = article.mainCategoryId || "";
    let selectedSubcategoryId = article.subcategoryId || "";
    let previousMainId = selectedMainCategoryId;

    let formErrors = {};
    let numberWarnings = {};
    let warningTimeouts = {};

    // --- Echtzeit-Fehlerbereinigung ---
    $: if (selectedMainCategoryId) formErrors.mainCategory = false;
    $: if (selectedSubcategoryId) formErrors.subCategory = false;
    $: if (title && title.trim() !== "") formErrors.title = false;
    $: if (description && description.trim() !== "") formErrors.description = false;
    $: if (istBestand !== null && istBestand !== undefined && istBestand.toString().trim() !== "") formErrors.istBestand = false;

    // --- Kategorien-Logik ---
    $: mainCategoryOptions = categories
        .filter((cat) => cat.subcategories && cat.subcategories.length > 0)
        .map((cat) => ({ value: cat._id, label: cat.name }));

    $: selectedMainCategory = categories.find((cat) => cat._id === selectedMainCategoryId) || null;
    $: availableSubcategories = selectedMainCategory ? selectedMainCategory.subcategories : [];
    $: subCategoryOptions = availableSubcategories.map((sub) => ({ value: sub.id, label: sub.name }));

    $: if (selectedMainCategoryId !== previousMainId) {
        selectedSubcategoryId = "";
        attributeValues = {};
        previousMainId = selectedMainCategoryId;
    }

    $: selectedSubcategory = availableSubcategories.find((sub) => sub.id === selectedSubcategoryId) || null;
    
    // Attribute abrufen und direkt alphabetisch (A-Z) sortieren!
    $: activeAttributes = selectedSubcategory
        ? attributes.filter((attr) => selectedSubcategory.allowed_attributes.includes(attr._id)).sort((a, b) => a.label.localeCompare(b.label, 'de', { sensitivity: 'base' }))
        : [];

    // --- Bild Management ---
    let existingImagePath = article.imagePath || null;
    let removeExistingImage = false; 
    
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

    function applyCrop() {
        if (!cropperInstance) return;
        const canvas = cropperInstance.getCroppedCanvas({ width: 1200, height: 900 }); 
        canvas.toBlob((blob) => {
            croppedFileBlob = blob;
            if (imagePreview) URL.revokeObjectURL(imagePreview);
            imagePreview = URL.createObjectURL(blob);
            cropperInstance.destroy(); cropperInstance = null; isCropping = false;
            removeExistingImage = true; 
        }, "image/jpeg", 0.85);
    }

    function cancelCrop() {
        if (cropperInstance) cropperInstance.destroy();
        isCropping = false; imagePreview = null; croppedFileBlob = null;
        if (fileInputElement) fileInputElement.value = "";
    }

    function deleteExistingImage() {
        existingImagePath = null;
        removeExistingImage = true;
    }

    onDestroy(() => {
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        if (cropperInstance) cropperInstance.destroy();
    });

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
</script>

<div class="page-container space-grotesk">
    
    {#if form?.error}
        <div class="alert error">{form.error}</div>
    {/if}

    <form
        method="POST"
        action="?/update"
        id="editForm"
        enctype="multipart/form-data"
        novalidate
        use:enhance={({ formData, cancel }) => {
            formErrors = {};
            let hasError = false;

            if (!selectedMainCategoryId) { formErrors.mainCategory = true; hasError = true; }
            if (!selectedSubcategoryId) { formErrors.subCategory = true; hasError = true; }
            if (!title.trim()) { formErrors.title = true; hasError = true; }
            if (!description.trim()) { formErrors.description = true; hasError = true; }
            
            const stockVal = formData.get("istBestand");
            if (!stockVal || stockVal.toString().trim() === "") { formErrors.istBestand = true; hasError = true; }
            
            if (hasError) {
                cancel();
                setTimeout(() => {
                    const firstErrorElement = document.querySelector('.error-highlight');
                    if (firstErrorElement) firstErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 50);
                return;
            }

            formData.append("articleId", article._id);
            if (removeExistingImage) formData.append("removeExistingImage", "true");
            if (croppedFileBlob) formData.set("image", croppedFileBlob, "article.jpg");

            for (const [key, value] of Object.entries(attributeValues)) {
                if (Array.isArray(value)) {
                    value.forEach(v => formData.append(`attr_${key}`, v));
                } else if (value !== undefined && value !== "") {
                    formData.append(`attr_${key}`, value);
                }
            }

            return async ({ result, update }) => {
                if (result.type === "success") {
                    goto(`/${article._id}?success=true`);
                } else {
                    await update();
                }
            };
        }}
    >
        
        <div class="top-bar">
            <div class="category-selectors">
                <select 
                    name="mainCategoryId" 
                    class="category-dropdown" 
                    class:error-highlight={formErrors.mainCategory}
                    bind:value={selectedMainCategoryId}>
                    <option value="" disabled>Hauptkategorie wählen...</option>
                    {#each mainCategoryOptions as opt}
                        <option value={opt.value}>{opt.label}</option>
                    {/each}
                </select>

                <span class="separator">/</span>

                <select 
                    name="subcategoryId" 
                    class="category-dropdown" 
                    class:error-highlight={formErrors.subCategory}
                    bind:value={selectedSubcategoryId}
                    disabled={!selectedMainCategoryId}>
                    <option value="" disabled>Unterkategorie wählen...</option>
                    {#each subCategoryOptions as opt}
                        <option value={opt.value}>{opt.label}</option>
                    {/each}
                </select>
            </div>

            <div class="action-buttons">
                <button type="button" class="btn-delete" on:click={(e) => {
                    if (confirm('Diesen Artikel wirklich endgültig löschen?')) {
                        const form = document.getElementById('editForm');
                        form.action = "?/delete";
                        form.submit();
                    }
                }}>
                    Löschen
                </button>
                <a href="/{article._id}" class="btn-cancel">Abbrechen</a>
                <button type="submit" class="btn-submit">Speichern</button>
            </div>
        </div>

        <div class="article-layout">
            
            <div class="image-section">
                {#if existingImagePath && !imagePreview && !isCropping}
                    <div class="image-workspace">
                        <img src={existingImagePath} alt="Aktuelles Artikelbild" class="main-image" />
                        <button type="button" class="btn-image-action delete" on:click={deleteExistingImage}>Bild entfernen</button>
                    </div>
                {:else if !existingImagePath && !isCropping && !imagePreview}
                    <div class="upload-placeholder">
                        <svg viewBox="0 0 24 24" width="48" height="48" stroke="#94a3b8" stroke-width="1.5" fill="none">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            <circle cx="8.5" cy="8.5" r="1.5"></circle>
                            <polyline points="21 15 16 10 5 21"></polyline>
                        </svg>
                        <span>Neues Artikelbild (4:3) hochladen</span>
                        <input type="file" id="image" accept="image/*" class="file-input-hidden" bind:this={fileInputElement} on:change={handleImageSelect} />
                        <button type="button" class="btn-image-action" on:click={() => fileInputElement.click()}>Durchsuchen</button>
                    </div>
                {:else if isCropping}
                    <div class="crop-editor-box">
                        <div class="crop-area">
                            <img bind:this={cropperImageEl} src={imagePreview} alt="Zuschneiden" />
                        </div>
                        <div class="cropper-actions">
                            <button type="button" class="btn-image-action cancel" on:click={cancelCrop}>Abbrechen</button>
                            <button type="button" class="btn-image-action save" on:click={applyCrop}>Zuschnitt speichern</button>
                        </div>
                    </div>
                {:else if imagePreview && !isCropping}
                    <div class="image-workspace">
                        <img src={imagePreview} alt="Vorschau" class="main-image" />
                        <button type="button" class="btn-image-action delete" on:click={cancelCrop}>Bild verwerfen</button>
                    </div>
                {/if}
            </div>

            <div class="info-section">
                
                <div class="input-wrapper tooltip-container">
                    <input type="text" name="title" class="title-input" class:error-highlight={formErrors.title} bind:value={title} placeholder="Artikelbezeichnung eingeben..." required />
                    {#if formErrors.title} <div class="warning-bubble">Bezeichnung fehlt</div> {/if}
                </div>
                
                <div class="price-stock-box">
                    <div class="price-input-wrapper">
                        <input type="number" name="price" class="price-input" bind:value={price} step="0.01" placeholder="0.00" />
                        <span class="currency">CHF / Stk.</span>
                    </div>
                    
                    <div class="stock-manager tooltip-container">
                        <span class="stock-label">Ist-Bestand:</span>
                        <input type="number" name="istBestand" class="stock-input" class:error-highlight={formErrors.istBestand} bind:value={istBestand} min="0" required />
                        <span class="stock-label">Stk.</span>
                        {#if formErrors.istBestand} <div class="warning-bubble">Bestand fehlt</div> {/if}
                    </div>
                </div>

                <div class="description">
                    <h3>Beschreibung</h3>
                    <div class="input-wrapper tooltip-container">
                        <textarea name="description" class="desc-input" class:error-highlight={formErrors.description} bind:value={description} rows="5" placeholder="Artikelbeschreibung hier eingeben..."></textarea>
                        {#if formErrors.description} <div class="warning-bubble">Beschreibung fehlt</div> {/if}
                    </div>
                </div>

                <div class="meta-grid">
                    <div class="meta-item">
                        <label class="meta-label">Lieferant</label>
                        <input type="text" name="supplier" class="meta-input" bind:value={supplier} placeholder="-" />
                    </div>
                    <div class="meta-item">
                        <label class="meta-label">GTIN / EAN / Art.Nr.</label>
                        <input type="text" name="gtin" class="meta-input" bind:value={gtin} placeholder="-" />
                    </div>
                    <div class="meta-item">
                        <label class="meta-label">Soll-Bestand</label>
                        <input type="number" name="sollBestand" class="meta-input" bind:value={sollBestand} min="0" placeholder="-" />
                    </div>
                    <div class="meta-item">
                        <label class="meta-label">Mindestbestand</label>
                        <input type="number" name="mindestBestand" class="meta-input" bind:value={mindestBestand} min="0" placeholder="-" />
                    </div>
                    <div class="meta-item full-width">
                        <label class="meta-label">Bestelllink</label>
                        <input type="url" name="orderLink" class="meta-input" bind:value={orderLink} placeholder="https://..." />
                    </div>
                </div>

                {#if activeAttributes.length > 0}
                    <div class="specs-section">
                        <h3>Spezifikationen</h3>
                        <table class="specs-table">
                            <tbody>
                                {#each activeAttributes as attr}
                                    <tr>
                                        <td class="spec-label">{attr.label}</td>
                                        <td class="spec-value tooltip-container">
                                            {#if attr.ui_type === "select"}
                                                {#if attr.is_multiple}
                                                    <div class="custom-multi-select-wrap">
                                                        <SearchableSelect
                                                            options={(attr.options || []).map((o) => ({ value: o, label: o }))}
                                                            multiple={true}
                                                            bind:value={attributeValues[attr._id]}
                                                        />
                                                    </div>
                                                {:else}
                                                    <select class="spec-input" bind:value={attributeValues[attr._id]}>
                                                        <option value=""></option>
                                                        {#each attr.options || [] as opt}
                                                            <option value={opt}>{opt}</option>
                                                        {/each}
                                                    </select>
                                                {/if}
                                            {:else}
                                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                    {#if attr.ui_type === "number"}
                                                        <input type="text" inputmode="decimal" class="spec-input" class:error-highlight={numberWarnings[attr._id]} bind:value={attributeValues[attr._id]} on:input={(e) => handleNumberInput(e, attr._id)} />
                                                    {:else}
                                                        <input type="text" class="spec-input" bind:value={attributeValues[attr._id]} />
                                                    {/if}
                                                    {#if attr.unit} <span class="spec-unit">{attr.unit}</span> {/if}
                                                </div>
                                            {/if}
                                            {#if attr.ui_type === "number" && numberWarnings[attr._id]}
                                                <div class="warning-bubble">Nur Zahlen, Punkt oder Komma!</div>
                                            {/if}
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {/if}

            </div>
        </div>
    </form>
</div>

<style>
    /* Generelles Layout - Hybrid Theme (Weiße Inputs auf dunklem Grund) */
    .page-container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 2rem 1rem;
        /* Basis-Textfarbe für alles, was auf dem dunklen Grund liegt */
        color: #cbd5e1; 
    }

    /* Top Bar (Weiße Karte) */
    .top-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 1rem;
        margin-bottom: 2rem;
        background: #ffffff;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    .category-selectors { display: flex; align-items: center; gap: 0.8rem; }
    .separator { color: #94a3b8; font-weight: bold; }
    
    .category-dropdown {
        appearance: none;
        background: #f8fafc;
        color: #334155;
        border: 1px solid #cbd5e1;
        padding: 0.5rem 2.5rem 0.5rem 1rem;
        border-radius: 6px;
        font-weight: 600;
        font-size: 0.95rem;
        cursor: pointer;
        outline: none;
        transition: all 0.2s;
        background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E");
        background-repeat: no-repeat;
        background-position: right 0.8rem top 50%;
        background-size: 0.65rem auto;
    }
    .category-dropdown:hover, .category-dropdown:focus { border-color: #3b82f6; background-color: #ffffff; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1); }
    .category-dropdown:disabled { opacity: 0.5; cursor: not-allowed; }

    .action-buttons { display: flex; gap: 0.8rem; align-items: center; }
    .btn-submit { background: #3b82f6; color: white; border: none; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 700; cursor: pointer; transition: background 0.2s; }
    .btn-submit:hover { background: #2563eb; }
    .btn-cancel { background: #f8fafc; color: #334155; border: 1px solid #cbd5e1; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 600; text-decoration: none; transition: all 0.2s; }
    .btn-cancel:hover { background: #e2e8f0; border-color: #94a3b8; }
    .btn-delete { background: transparent; color: #ef4444; border: none; padding: 0.6rem 1rem; font-weight: 600; cursor: pointer; transition: color 0.2s; }
    .btn-delete:hover { text-decoration: underline; color: #b91c1c; }

    /* Layout */
    .article-layout { display: flex; gap: 3rem; align-items: flex-start; }

    /* Linke Seite (Bild & Upload) - Weiße Karte */
    .image-section {
        flex: 1;
        position: sticky;
        top: 2rem;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 2rem;
        min-height: 400px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    
    .upload-placeholder { display: flex; flex-direction: column; align-items: center; gap: 1rem; color: #64748b; text-align: center; }
    .file-input-hidden { display: none; }
    .btn-image-action { background: #f8fafc; color: #334155; border: 1px solid #cbd5e1; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .btn-image-action:hover { background: #e2e8f0; border-color: #94a3b8; }
    .btn-image-action.delete { background: #fee2e2; color: #b91c1c; border-color: #fecaca; margin-top: 1rem; width: 100%;}
    .btn-image-action.delete:hover { background: #fecaca; }
    .btn-image-action.save { background: #22c55e; color: white; border-color: #22c55e; }
    .btn-image-action.save:hover { background: #16a34a; }

    .image-workspace { width: 100%; display: flex; flex-direction: column; align-items: center; }
    .main-image { max-width: 100%; max-height: 400px; object-fit: contain; border-radius: 6px; mix-blend-mode: multiply; }
    
    .crop-editor-box { width: 100%; display: flex; flex-direction: column; gap: 1rem; overflow: hidden; }
    .crop-area { width: 100%; max-width: 100%; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; max-height: 400px; }
    .crop-area img { display: block; max-width: 100%; height: auto; }
    .cropper-actions { display: flex; justify-content: space-between; gap: 1rem; }

    /* Rechte Seite (Infos Editierbar) */
    .info-section { flex: 1.5; display: flex; flex-direction: column; gap: 2rem; }

    .title-input {
        width: 100%;
        font-size: 2.2rem;
        color: #22c55e; 
        font-weight: 700;
        font-family: inherit;
        background: transparent;
        border: 1px dashed transparent;
        border-bottom: 2px solid #334155; /* Sichtbarer Rahmen auf dunklem Grund */
        padding: 0.2rem 0.5rem;
        margin-left: -0.5rem; 
        transition: all 0.2s;
    }
    .title-input:focus, .title-input:hover { border-color: #22c55e; background: rgba(255,255,255,0.05); outline: none; border-style: solid; box-shadow: 0 4px 6px -4px rgba(34, 197, 94, 0.2); }

    .price-stock-box { display: flex; align-items: center; gap: 3rem; padding-bottom: 1.5rem; border-bottom: 1px solid #334155; }
    
    .price-input-wrapper { display: flex; align-items: center; gap: 0.5rem; }
    .price-input {
        width: 120px;
        font-size: 1.8rem;
        font-weight: 700;
        color: #38bdf8; /* Helleres Blau */
        background: transparent;
        border: 1px dashed transparent;
        border-bottom: 2px solid #334155;
        padding: 0.2rem;
        text-align: right;
        transition: all 0.2s;
        -moz-appearance: textfield;
    }
    .price-input:focus, .price-input:hover { border-color: #38bdf8; background: rgba(255,255,255,0.05); outline: none; border-style: solid; }
    
    /* FIX: Einheiten "CHF / Stk." heller machen! */
    .currency { font-size: 1.2rem; color: #cbd5e1; font-weight: 500; }

    /* Weiße Box für den Bestand */
    .stock-manager { display: flex; align-items: center; gap: 0.5rem; background: #ffffff; padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    .stock-label { color: #64748b; font-weight: 600; font-size: 0.95rem; }
    .stock-input {
        width: 70px;
        font-size: 1.2rem;
        font-weight: 700;
        color: #1e293b;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 0.3rem;
        text-align: center;
        transition: all 0.2s;
    }
    .stock-input:focus { border-color: #3b82f6; outline: none; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1); }

    /* FIX: Überschriften auf dunklem Grund WEISS machen! */
    .description h3, .specs-section h3 { 
        font-size: 1.2rem; 
        color: #ffffff; 
        margin: 0 0 1rem 0; 
        font-weight: 700; 
    }
    
    .desc-input {
        width: 100%;
        line-height: 1.6;
        color: #1e293b;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 1rem;
        font-family: inherit;
        resize: vertical;
        transition: all 0.2s;
    }
    .desc-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1); }

    /* Meta Grid - Bleibt transparent auf dunklem Grund, Inputs werden weiß */
    .meta-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1.5rem;
        background: transparent; 
        padding: 0;
        border: none;
    }
    .meta-item { display: flex; flex-direction: column; gap: 0.4rem; }
    .meta-item.full-width { grid-column: 1 / -1; }
    
    /* FIX: Labels hell machen ("LIEFERANT", "GTIN", etc.) */
    .meta-label { font-size: 0.85rem; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
    
    .meta-input {
        background: #ffffff;
        color: #334155;
        border: 1px solid #cbd5e1;
        padding: 0.5rem 0.8rem;
        border-radius: 6px;
        font-weight: 500;
        transition: all 0.2s;
    }
    .meta-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1); }

    /* Spezifikationen Tabelle Inputs - Weiße Box auf dunklem Grund */
    .specs-table { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .specs-table tr:nth-child(odd) { background: #f8fafc; }
    .specs-table td { padding: 0.8rem 1rem; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
    .specs-table tr:last-child td { border-bottom: none; }
    
    /* Label innerhalb der weißen Tabelle */
    .spec-label { width: 40%; color: #64748b; font-weight: 500; }
    
    .spec-input {
        width: 100%;
        background: #ffffff;
        color: #334155;
        border: 1px solid #cbd5e1;
        padding: 0.4rem 0.6rem;
        border-radius: 4px;
        font-weight: 600;
        transition: all 0.2s;
    }
    .spec-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1); }
    .spec-unit { color: #64748b; font-weight: 600; font-size: 0.9rem; }

    /* Fix für SearchableSelect in der Tabelle */
    .custom-multi-select-wrap { background: #ffffff; border-radius: 6px; }

    /* Tooltips und Blasen für Error-Handling */
    .tooltip-container { position: relative !important; overflow: visible !important; width: 100%; }
    .warning-bubble {
        position: absolute; bottom: calc(100% + 4px); left: 50%; transform: translateX(-50%);
        background-color: #ef4444; color: white; padding: 5px 9px; border-radius: 6px;
        font-size: 0.75rem; font-weight: 700; white-space: nowrap; z-index: 999;
        box-shadow: 0 4px 10px rgba(239, 68, 68, 0.25); pointer-events: none;
        animation: popIn 0.18s ease-out forwards;
    }
    .warning-bubble::after {
        content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
        border-width: 5px; border-style: solid; border-color: #ef4444 transparent transparent transparent;
    }
    @keyframes popIn { 0% { opacity: 0; transform: translate(-50%, 4px) scale(0.93); } 100% { opacity: 1; transform: translate(-50%, 0) scale(1); } }

    .error-highlight {
        border-color: #ef4444 !important;
        background-color: #fef2f2 !important;
        box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.15) !important;
    }
    .title-input.error-highlight, .price-input.error-highlight {
        border: 1px solid #ef4444 !important;
        border-radius: 6px;
    }

    /* Responsive */
    @media (max-width: 900px) {
        .article-layout { flex-direction: column; }
        .image-section { position: static; width: 100%; box-sizing: border-box; min-height: 300px; }
        .top-bar { flex-direction: column; align-items: stretch; }
        .action-buttons { justify-content: space-between; margin-top: 1rem; }
        .price-stock-box { flex-direction: column; align-items: flex-start; gap: 1rem; }
    }
</style>