<script>
    import { onDestroy, tick, onMount } from "svelte";
    import { browser } from "$app/environment";
    import { enhance } from "$app/forms";
    import SearchableSelect from "$lib/components/SearchableSelect.svelte";
    import AiModelBadge from "$lib/components/AiModelBadge.svelte";
    import { prepareOnWhite, rotateBlob } from "$lib/imageTools.js";
    import { page } from "$app/stores";
    import { goto, invalidateAll } from "$app/navigation"; 

    import "cropperjs/dist/cropper.css";
    import Cropper from "cropperjs";

    export let data;
    export let form;

    // 🔥 Absolut sicheres Entpacken. Verhindert Absturz, falls der Server kurz hakt.
    // Reaktiv, damit per KI neu angelegte Kategorien & Filter sofort erscheinen
    $: categories = data?.categories || [];
    $: attributes = data?.attributes || [];
    const copiedArticle = data?.copiedArticle || null;
    const bookmarkletData = data?.bookmarkletData || {};

    // --- State Management ---
    // Priorität: Kopie -> Bookmarklet -> Leer
    // Altes Lesezeichen schickt Rohtext ("DESC: ... | JSON: ..."): nur den Beschreibungsteil übernehmen
    function initialDescriptionFromBookmarklet(raw) {
        if (!raw) return "";
        const match = raw.match(/^DESC:\s*(.*?)\s*(\||$)/);
        return match ? match[1] : "";
    }

    let title = copiedArticle?.title ? `${copiedArticle.title} (Kopie)` : (bookmarkletData?.title || "");
    let description = copiedArticle?.description || initialDescriptionFromBookmarklet(bookmarkletData?.desc);
    let orderLink = copiedArticle?.orderLink || bookmarkletData?.url || "";
    
    let supplier = copiedArticle?.supplier || "";
    let gtin = copiedArticle?.gtin || ""; 
    let price = copiedArticle?.price || "";
    let istBestand = copiedArticle ? 0 : ""; // Bei Kopie Start auf 0

    let importUrl = orderLink;
    let isExtracting = false;

    let totalPackPrice = "";
    let packQuantity = "";
    
    $: if (totalPackPrice && packQuantity && parseFloat(packQuantity) > 0) {
        price = (parseFloat(totalPackPrice) / parseFloat(packQuantity)).toFixed(2);
    }

    let rawImportText = bookmarkletData?.desc || ""; 
    let importedImageUrl = bookmarkletData?.img || ""; 

    // --- Bild-Kandidaten von der Shop-Seite ---
    let imageCandidates = importedImageUrl ? [{ url: importedImageUrl, alt: "" }] : [];
    let brokenCandidates = new Set();
    $: visibleCandidates = imageCandidates.filter(i => !brokenCandidates.has(i.url));
    let selectedImageUrl = "";
    // Nur falls ein Bild nicht über den Proxy geladen werden konnte, wird der externe Link gespeichert
    let externalFallbackUrl = "";

    // Neues Lesezeichen (v2): Daten kommen per postMessage aus dem Shop-Fenster
    let importReceived = false;
    function handleImportMessage(event) {
        const payload = event.data;
        if (!payload || payload.type !== "sortify-import" || typeof payload.text !== "string") return;

        // Nur vom Shop akzeptieren, dessen Seite übergeben wurde
        let shopOrigin = "";
        try { shopOrigin = new URL(bookmarkletData?.url).origin; } catch {}
        if (!shopOrigin || event.origin !== shopOrigin) return;

        event.source?.postMessage({ type: "sortify-import-ack" }, event.origin);
        if (importReceived) return;
        importReceived = true;

        rawImportText = payload.text.slice(0, 60000);
        if (!description && typeof payload.description === "string") description = payload.description.slice(0, 1000);

        const candidates = (Array.isArray(payload.images) ? payload.images : [])
            .filter(i => typeof i?.url === "string" && /^https?:\/\//i.test(i.url))
            .slice(0, 24)
            .map(i => ({ url: i.url, alt: String(i.alt || "").slice(0, 80) }));
        if (candidates.length > 0) imageCandidates = candidates;

        requestCategorySuggestion();
    }

    // --- Verwendetes KI-Modell (wechselt automatisch, wenn Kontingente erschöpft sind) ---
    let currentAiModel = null;     // Modell, das als nächstes verwendet würde
    let aiStatusLoaded = false;
    let lastExtractModel = null;   // Modell der letzten Artikel-Analyse
    let categorySuggestionModel = null;

    async function loadAiStatus() {
        try {
            const res = await fetch("/api/ai-status");
            if (res.ok) currentAiModel = (await res.json()).aiModel;
        } catch {}
        aiStatusLoaded = true;
    }

    // Jede KI-Antwort aktualisiert die Anzeige des aktuellen Modells
    function rememberAiModel(model) {
        if (model) currentAiModel = model;
        return model || null;
    }

    // --- KI-Vorschlag für Haupt- & Unterkategorie (nur bestehende Kategorien) ---
    let categorySuggestionState = ""; // "" | "loading" | "done" | "none"
    let suggestedCategory = null;
    let categorySuggestionRequested = false;
    $: isSuggestionActive = !!suggestedCategory
        && selectedMainCategoryId === suggestedCategory.mainCategoryId
        && selectedSubcategoryId === suggestedCategory.subcategoryId;

    async function requestCategorySuggestion() {
        if (categorySuggestionRequested || copiedArticle || selectedMainCategoryId || mainCategoryOptions.length === 0) return;
        const text = rawImportText || [title, bookmarkletData?.url].filter(Boolean).join("\n");
        if (!text) return;
        categorySuggestionRequested = true;
        categorySuggestionState = "loading";
        try {
            const res = await fetch("/api/suggest-category", {
                method: "POST",
                signal: AbortSignal.timeout(60000), // nie endlos warten
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text })
            });
            const result = await res.json();
            categorySuggestionModel = rememberAiModel(result.aiModel);
            // Nur übernehmen, wenn in der Zwischenzeit nicht selbst gewählt wurde
            if (res.ok && result.suggestion && !selectedMainCategoryId) {
                selectedMainCategoryId = result.suggestion.mainCategoryId;
                await tick(); // Unterkategorien der neuen Hauptkategorie erst rendern lassen
                selectedSubcategoryId = result.suggestion.subcategoryId;
                suggestedCategory = result.suggestion;
                categorySuggestionState = "done";
            } else {
                categorySuggestionState = "none";
            }
        } catch (err) {
            console.warn("Kategorie-Vorschlag fehlgeschlagen:", err);
            categorySuggestionState = "none";
        }
    }

    // --- KI-Empfehlung für eine NEUE Kategorie-Struktur (wenn keine bestehende passt) ---
    let structure = null;          // Antwort des KI-Assistenten
    let structureState = "";       // "" | "loading" | "ready" | "saving"
    let structureError = "";
    let structMainMode = "existing", structMainId = "", structNewMainName = "";
    let structSubMode = "existing", structSubId = "", structNewSubName = "";
    let structExistingAttrs = [];  // IDs bestehender Filter
    let structNewAttrs = [];       // neue Filter (bearbeitbar)

    $: structAvailableSubs = structMainMode === "new"
        ? []
        : (safeCategories.find((c) => c._id === structMainId)?.subcategories || []);
    $: if (structMainMode === "new") structSubMode = "new";

    // avoid: vom Nutzer abgelehnte Zuordnung { mainCategoryId, subcategoryId }
    async function requestCategoryStructure(avoid = null) {
        structureState = "loading";
        structureError = "";
        try {
            const articleText = (rawImportText || [title, bookmarkletData?.url].filter(Boolean).join("\n")).slice(0, 18000);
            const res = await fetch("/api/ai-category-wizard", {
                method: "POST",
                signal: AbortSignal.timeout(60000), // nie endlos warten
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ articleText, avoid })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Fehler bei der KI-Analyse.");

            structure = result;
            rememberAiModel(result.aiModel);
            structMainMode = result.mainCategory.isNew ? "new" : "existing";
            structMainId = result.mainCategory.id || "";
            structNewMainName = result.mainCategory.suggestedName || "";
            structSubMode = result.subCategory.isNew ? "new" : "existing";
            structSubId = result.subCategory.id || "";
            structNewSubName = result.subCategory.suggestedName || "";
            structExistingAttrs = [...result.existingAttributeIds];
            structNewAttrs = result.newAttributes.map((a) => ({ ...a, selected: true, optionsString: (a.options || []).join(", ") }));
            structureState = "ready";
        } catch (err) {
            structureError = err.message || "Fehler bei der KI-Analyse.";
            structureState = "";
        }
    }

    function toggleStructExistingAttr(id) {
        structExistingAttrs = structExistingAttrs.includes(id)
            ? structExistingAttrs.filter((x) => x !== id)
            : [...structExistingAttrs, id];
    }

    async function applyStructure() {
        structureState = "saving";
        structureError = "";
        try {
            const fd = new FormData();
            fd.set("mainMode", structMainMode);
            fd.set("existingMainId", structMainId);
            fd.set("newMainName", structNewMainName);
            fd.set("subMode", structSubMode);
            fd.set("existingSubId", structSubId);
            fd.set("newSubName", structNewSubName);
            fd.set("existingAttributes", JSON.stringify(structExistingAttrs));
            fd.set("newAttributes", JSON.stringify(structNewAttrs.filter((a) => a.selected).map((a) => ({
                label: a.label,
                ui_type: a.ui_type,
                unit: a.unit || "",
                options: a.ui_type === "select" ? (a.optionsString || "").split(",").map((o) => o.trim()).filter(Boolean) : []
            }))));

            const res = await fetch("/api/apply-category-structure", { method: "POST", body: fd });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Die Kategorie konnte nicht angelegt werden.");

            // Neue Kategorien & Filter laden und direkt auswählen
            await invalidateAll();
            selectedMainCategoryId = result.mainId;
            await tick();
            selectedSubcategoryId = result.subId;
            suggestedCategory = { mainCategoryId: result.mainId, subcategoryId: result.subId };
            categorySuggestionState = "created";
            structure = null;
            structureState = "";
        } catch (err) {
            structureError = err.message || "Die Kategorie konnte nicht angelegt werden.";
            structureState = "ready";
        }
    }

    // Vorschaubild direkt vom Shop laden; bei Hotlink-Schutz über den eigenen Proxy, sonst ausblenden
    function handleThumbError(event, url) {
        const img = event.currentTarget;
        if (!img.dataset.proxied) {
            img.dataset.proxied = "1";
            img.src = `/api/fetch-image?url=${encodeURIComponent(url)}`;
        } else {
            brokenCandidates = new Set([...brokenCandidates, url]);
        }
    }
    let attributeValues = copiedArticle?.attributes ? { ...copiedArticle.attributes } : {};

    let selectedMainCategoryId = copiedArticle?.mainCategoryId || "";
    let selectedSubcategoryId = copiedArticle?.subcategoryId || "";

    let formErrors = {};
    let showSuccessMessage = false;

    let numberWarnings = {};
    let warningTimeouts = {};

    // --- Bookmarklet & KI Workflow States ---
    let isFromBookmarklet = !!(bookmarkletData?.title || bookmarkletData?.url);
    let aiChoiceMade = false;
    let showAIPrompt = false;
    let showAIWarning = false;

    // --- Echtzeit-Fehlerbereinigung ---
    $: if (selectedMainCategoryId) formErrors.mainCategory = false;
    $: if (selectedSubcategoryId) formErrors.subCategory = false;
    $: if (title && title.trim() !== "") formErrors.title = false;
    $: if (istBestand !== null && istBestand !== undefined && istBestand.toString().trim() !== "") formErrors.istBestand = false;

    // 🔥 KUGELSICHERE Kategorien-Logik
    $: safeCategories = Array.isArray(categories) ? categories : [];
    
    $: mainCategoryOptions = safeCategories
        .filter((cat) => cat && Array.isArray(cat.subcategories) && cat.subcategories.length > 0)
        .map((cat) => ({ value: cat._id, label: cat.name }));

    $: selectedMainCategory = safeCategories.find((cat) => cat._id === selectedMainCategoryId) || null;
    
    $: availableSubcategories = selectedMainCategory && Array.isArray(selectedMainCategory.subcategories) 
        ? selectedMainCategory.subcategories 
        : [];
        
    $: subCategoryOptions = availableSubcategories.map((sub) => ({ value: sub.id, label: sub.name }));

    $: selectedSubcategory = availableSubcategories.find((sub) => sub.id === selectedSubcategoryId) || null;
    
    $: safeAttributes = Array.isArray(attributes) ? attributes : [];
    
    $: activeAttributes = selectedSubcategory && Array.isArray(selectedSubcategory.allowed_attributes)
        ? safeAttributes.filter((attr) => selectedSubcategory.allowed_attributes.includes(attr._id)).sort((a, b) => (a.label || "").localeCompare(b.label || "", 'de', { sensitivity: 'base' }))
        : [];

    onMount(async () => {
        if (isFromBookmarklet) {
            loadAiStatus();
            window.addEventListener("message", handleImportMessage);
            if ($page.url.searchParams.get("import") === "2") {
                // Neues Lesezeichen: auf die Daten warten, notfalls nur mit Titel & URL vorschlagen
                setTimeout(requestCategorySuggestion, 4000);
            } else {
                // Altes Lesezeichen: die Daten stehen bereits in der URL
                requestCategorySuggestion();
            }
        }

        if (copiedArticle && copiedArticle.subcategoryId) {
            await tick();
            selectedSubcategoryId = copiedArticle.subcategoryId;
        }

        const imageToLoad = copiedArticle?.imagePath || importedImageUrl;
        if (imageToLoad) {
            try {
                await loadExternalImage(imageToLoad);
            } catch (err) {
                console.warn("Bild konnte nicht automatisch im Cropper geladen werden:", err);
            }
        }
    });

    // --- KI Prompt Trigger ---
    $: if (isFromBookmarklet && !aiChoiceMade && selectedMainCategoryId && selectedSubcategoryId) {
        showAIPrompt = true;
    } else {
        showAIPrompt = false;
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
                signal: AbortSignal.timeout(60000), // nie endlos warten
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    html: rawImportText || importUrl,
                    url: orderLink,
                    images: visibleCandidates,
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
                lastExtractModel = rememberAiModel(result.aiModel);
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

                // Die KI wählt das beste Hauptproduktbild aus den gefundenen Bildern
                const aiImageToLoad = result.finalImageUrl;
                if (aiImageToLoad && aiImageToLoad !== selectedImageUrl) {
                    try {
                        await loadExternalImage(aiImageToLoad);
                    } catch (e) {
                        console.warn("KI Bild konnte nicht geladen werden", e);
                    }
                }
            } else if (browser) {
                alert(result.error || "Fehler bei der KI-Analyse.");
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
        selectedImageUrl = "";
        externalFallbackUrl = "";
        await processImageBlob(file);
    }

    // 🔥 Robuster Proxy-Aufruf
    async function loadExternalImage(imageUrl) {
        if (!imageUrl) return;
        selectedImageUrl = imageUrl;
        externalFallbackUrl = "";
        croppedFileBlob = null;
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
            
            if (blob && blob.size > 0) {
                processImageBlob(blob);
            } else {
                throw new Error("Leeres Bild erhalten");
            }
        } catch (error) {
            console.error("Bild blockiert (Seite bleibt stabil):", error);
            if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
            isCropping = false;
            imagePreview = imageUrl; 
            externalFallbackUrl = imageUrl;
        }
    }

    // Original des aktuellen Bildes (für verlustfreies Drehen vor der Aufbereitung)
    let sourceBlob = null;
    let isRotating = false;

    async function processImageBlob(blob) {
        sourceBlob = blob;
        const prepared = await prepareOnWhite(blob);
        if (imagePreview && imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
        imagePreview = URL.createObjectURL(prepared);
        isCropping = true;
        
        await tick();
        
        setTimeout(() => {
            if (!cropperImageEl) return;
            if (cropperInstance) cropperInstance.destroy();
            // Startet mit dem ganzen (bereits 4:3 aufbereiteten) Bild – Ausschnitt kann verkleinert werden
            cropperInstance = new Cropper(cropperImageEl, { aspectRatio: 4 / 3, viewMode: 1, autoCropArea: 1, background: false, zoomable: false });
        }, 50);
    }

    // Bild um 90° drehen: das Original drehen und neu auf die weisse 4:3-Fläche legen
    async function rotateImage(degrees) {
        if (!sourceBlob || isRotating) return;
        isRotating = true;
        try {
            await processImageBlob(await rotateBlob(sourceBlob, degrees));
        } finally {
            isRotating = false;
        }
    }

    // Aktuellen Ausschnitt als JPEG erzeugen (Flächen ausserhalb des Bildes werden weiss)
    function cropToBlob() {
        return new Promise((resolve) => {
            if (!cropperInstance) return resolve(null);
            const canvas = cropperInstance.getCroppedCanvas({ width: 1200, height: 900, fillColor: "#ffffff" });
            canvas.toBlob(resolve, "image/jpeg", 0.85);
        });
    }

    async function applyCrop() {
        if (!cropperInstance) return;
        const blob = await cropToBlob();
        if (!blob) return;
        croppedFileBlob = blob;
        if (imagePreview && imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
        imagePreview = URL.createObjectURL(blob);
        cropperInstance.destroy(); cropperInstance = null; isCropping = false;
    }

    function cancelCrop() {
        if (cropperInstance) cropperInstance.destroy();
        cropperInstance = null;
        isCropping = false; imagePreview = null; croppedFileBlob = null; sourceBlob = null;
        selectedImageUrl = ""; externalFallbackUrl = "";
        if (fileInputElement) fileInputElement.value = "";
    }

    onDestroy(() => {
        if (imagePreview && imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
        if (cropperInstance) cropperInstance.destroy();
        if (browser) window.removeEventListener("message", handleImportMessage);
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
        {#if lastExtractModel}
            <div style="margin-bottom: 1rem;"><AiModelBadge model={lastExtractModel} prefix="Analysiert mit" /></div>
        {/if}
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
        use:enhance={async ({ formData, cancel }) => {
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

            // Ist der Zuschnitt noch offen, den aktuellen Ausschnitt automatisch übernehmen
            if (isCropping && cropperInstance) croppedFileBlob = await cropToBlob();
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

            {#if categorySuggestionState === "loading"}
                <div class="ai-category-status"><span class="mini-spinner"></span> KI sucht die passende Kategorie…</div>
            {:else if isSuggestionActive && categorySuggestionState === "created"}
                <div class="ai-category-status done">✨ Neue Kategorie angelegt und ausgewählt.</div>
            {:else if isSuggestionActive}
                <div class="ai-category-status done no-match">
                    <span>✨ Kategorie von der KI vorgeschlagen – bitte kurz prüfen.</span>
                    {#if categorySuggestionModel}<AiModelBadge model={categorySuggestionModel} />{/if}
                    {#if data.canManageCategories && !structure}
                        <!-- Nicht einverstanden? Andere/neue Kategorie per KI planen lassen -->
                        <button type="button" class="btn-structure btn-structure-secondary" disabled={structureState === "loading"}
                            on:click={() => requestCategoryStructure({ mainCategoryId: selectedMainCategoryId, subcategoryId: selectedSubcategoryId })}>
                            {#if structureState === "loading"}<span class="mini-spinner"></span> KI plant Kategorie…{:else}Nicht passend? Andere Kategorie per KI erstellen{/if}
                        </button>
                    {/if}
                </div>
            {:else if isFromBookmarklet && !selectedMainCategoryId && !structure && (categorySuggestionState === "none" || mainCategoryOptions.length === 0)}
                <div class="ai-category-status no-match">
                    <span>Keine passende Kategorie gefunden – bitte selbst wählen{data.canManageCategories ? ' oder eine neue anlegen lassen' : ''}.</span>
                    {#if data.canManageCategories}
                        <button type="button" class="btn-structure" on:click={requestCategoryStructure} disabled={structureState === "loading"}>
                            {#if structureState === "loading"}<span class="mini-spinner"></span> KI plant Kategorie…{:else}✨ KI-Empfehlung für passende Kategorie erstellen{/if}
                        </button>
                    {/if}
                </div>
            {/if}

            {#if structureError && !structure}
                <div class="alert error" style="margin-bottom: 1rem;">{structureError}</div>
            {/if}

            {#if structure}
                <div class="struct-panel">
                    <div class="struct-title">✨ KI-Empfehlung für die Kategorie</div>
                    {#if structure.aiModel}<div style="margin: -0.4rem 0 1rem 0;"><AiModelBadge model={structure.aiModel} /></div>{/if}

                    <div class="struct-grid">
                        <div class="struct-box">
                            <span class="struct-label">Hauptkategorie</span>
                            <div class="struct-modes">
                                <label><input type="radio" name="ai_struct_main" value="existing" bind:group={structMainMode} disabled={mainCategoryOptions.length === 0}> Bestehende</label>
                                <label><input type="radio" name="ai_struct_main" value="new" bind:group={structMainMode}> Neu anlegen</label>
                            </div>
                            {#if structMainMode === "existing"}
                                <select class="standard-select" bind:value={structMainId} on:change={() => (structSubId = "")}>
                                    <option value="" disabled>Wählen...</option>
                                    {#each safeCategories as cat}<option value={cat._id}>{cat.name}</option>{/each}
                                </select>
                            {:else}
                                <input type="text" class="struct-input-new" bind:value={structNewMainName} maxlength="60" placeholder="Name der neuen Hauptkategorie" />
                            {/if}
                        </div>

                        <div class="struct-box">
                            <span class="struct-label">Unterkategorie</span>
                            <div class="struct-modes">
                                <label><input type="radio" name="ai_struct_sub" value="existing" bind:group={structSubMode} disabled={structMainMode === "new" || structAvailableSubs.length === 0}> Bestehende</label>
                                <label><input type="radio" name="ai_struct_sub" value="new" bind:group={structSubMode}> Neu anlegen</label>
                            </div>
                            {#if structSubMode === "existing"}
                                <select class="standard-select" bind:value={structSubId}>
                                    <option value="" disabled>Wählen...</option>
                                    {#each structAvailableSubs as sub}<option value={sub.id}>{sub.name}</option>{/each}
                                </select>
                            {:else}
                                <input type="text" class="struct-input-new" bind:value={structNewSubName} maxlength="60" placeholder="Name der neuen Unterkategorie" />
                            {/if}
                        </div>
                    </div>

                    <span class="struct-label" style="margin-top: 1.25rem; display: block;">Filter für diese Unterkategorie</span>
                    <div class="struct-filters">
                        {#each structure.existingAttributeIds as attrId}
                            {@const def = safeAttributes.find((a) => a._id === attrId)}
                            {#if def}
                                <label class="struct-filter">
                                    <input type="checkbox" checked={structExistingAttrs.includes(attrId)} on:change={() => toggleStructExistingAttr(attrId)} />
                                    <div class="struct-filter-body">
                                        <div class="struct-filter-head"><strong>{def.label}</strong><span class="struct-badge">vorhanden</span></div>
                                        <small>
                                            {#if def.ui_type === "select"}Optionen: {(def.options || []).join(", ") || "–"}
                                            {:else if def.ui_type === "number"}Zahl{def.unit ? ` (${def.unit})` : ""}
                                            {:else}Text{/if}
                                        </small>
                                    </div>
                                </label>
                            {/if}
                        {/each}

                        {#each structNewAttrs as attr}
                            <div class="struct-filter is-new">
                                <input type="checkbox" bind:checked={attr.selected} />
                                <div class="struct-filter-body">
                                    <div class="struct-filter-head"><span class="struct-badge new">neu</span></div>
                                    <input type="text" class="struct-input-new" bind:value={attr.label} maxlength="60" placeholder="Name des Filters" />
                                    {#if attr.ui_type === "select"}
                                        <small>Optionen (mit Komma getrennt):</small>
                                        <input type="text" bind:value={attr.optionsString} placeholder="Option 1, Option 2, ..." />
                                    {:else if attr.ui_type === "number"}
                                        <small>Zahl – Einheit:</small>
                                        <input type="text" bind:value={attr.unit} maxlength="15" placeholder="z.B. mm" />
                                    {:else}
                                        <small>Textfeld</small>
                                    {/if}
                                </div>
                            </div>
                        {/each}

                        {#if structure.existingAttributeIds.length === 0 && structNewAttrs.length === 0}
                            <small class="struct-empty">Keine Filter vorgeschlagen.</small>
                        {/if}
                    </div>

                    {#if structureError}
                        <div class="alert error" style="margin: 1rem 0 0 0;">{structureError}</div>
                    {/if}

                    <div class="struct-actions">
                        <button type="button" class="btn-ai-no" on:click={() => { structure = null; structureError = ""; }}>Verwerfen</button>
                        <button type="button" class="btn-ai-yes" on:click={applyStructure} disabled={structureState === "saving"}>
                            {structureState === "saving" ? "Wird angelegt…" : "Kategorie anlegen & übernehmen"}
                        </button>
                    </div>
                </div>
            {/if}
            
            {#if mainCategoryOptions.length === 0}
                <div class="alert error" style="margin-bottom: 0;">
                    <strong>Keine Kategorien verfügbar!</strong> Bitte legen Sie zuerst in den Einstellungen eine Hauptkategorie inkl. Unterkategorie an, um Artikel speichern zu können.
                </div>
            {:else}
                <div class="form-group tooltip-container">
                    <span class="label-text">Hauptkategorie *</span>
                    <div class="select-wrapper" class:error-highlight={formErrors.mainCategory || (isFromBookmarklet && !aiChoiceMade && !selectedMainCategoryId)}>
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
                {#if currentAiModel}
                    <div class="ai-model-row"><AiModelBadge model={currentAiModel} prefix="Verwendet" /></div>
                {:else if aiStatusLoaded}
                    <div class="ai-model-row ai-model-exhausted">⚠️ Die Tageskontingente aller KI-Modelle sind aufgebraucht (Reset um 09:00 Uhr).</div>
                {/if}
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

            <!-- 🔥 Verstecktes Feld, um die Bild-URL vom Bookmarklet an den Server zu senden -->
            <input type="hidden" name="externalImageUrl" value={croppedFileBlob ? "" : externalFallbackUrl} />

            <div class="image-area">
                <span class="label-text">Artikelbild (4:3)</span>

                {#if visibleCandidates.length > 1}
                    <div class="candidate-gallery">
                        <span class="candidate-hint">{visibleCandidates.length} Bilder auf der Webseite gefunden – zum Übernehmen anklicken</span>
                        <div class="candidate-grid">
                            {#each visibleCandidates as candidate (candidate.url)}
                                <button
                                    type="button"
                                    class="candidate"
                                    class:selected={candidate.url === selectedImageUrl}
                                    title={candidate.alt || "Bild übernehmen"}
                                    on:click={() => loadExternalImage(candidate.url)}
                                >
                                    <img src={candidate.url} alt={candidate.alt} loading="lazy" referrerpolicy="no-referrer" on:error={(e) => handleThumbError(e, candidate.url)} />
                                </button>
                            {/each}
                        </div>
                    </div>
                {/if}

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
                        <div class="cropper-actions" style="display: flex; gap: 1rem; justify-content: flex-end; flex-wrap: wrap;">
                            <button type="button" class="btn-rotate" on:click={() => rotateImage(-90)} disabled={isRotating} title="Bild nach links drehen">⟲ Links drehen</button>
                            <button type="button" class="btn-rotate" on:click={() => rotateImage(90)} disabled={isRotating} title="Bild nach rechts drehen">⟳ Rechts drehen</button>
                            <span style="flex: 1;"></span>
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

    /* Bildauswahl aus dem Lesezeichen-Import */
    .candidate-gallery { margin-top: 0.6rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .candidate-hint { font-size: 0.85rem; color: #64748b; }
    .candidate-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 0.5rem; }
    .candidate {
        aspect-ratio: 1; background: #ffffff; border: 2px solid #e2e8f0; border-radius: 8px; padding: 0.3rem;
        cursor: pointer; display: flex; align-items: center; justify-content: center; overflow: hidden; transition: border-color 0.15s, box-shadow 0.15s;
    }
    .candidate:hover { border-color: #93c5fd; }
    .candidate.selected { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25); }
    .candidate img { max-width: 100%; max-height: 100%; object-fit: contain; }

    /* Hinweis zum KI-Kategorievorschlag */
    .ai-category-status {
        display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; padding: 0.6rem 0.9rem;
        border-radius: 8px; font-size: 0.9rem; font-weight: 600; background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0;
    }
    .ai-category-status.done { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
    .mini-spinner {
        width: 14px; height: 14px; border: 2px solid #cbd5e1; border-top-color: #3b82f6; border-radius: 50%;
        animation: mini-spin 0.8s linear infinite; flex-shrink: 0;
    }
    @keyframes mini-spin { to { transform: rotate(360deg); } }

    /* KI-Empfehlung für eine neue Kategorie-Struktur */
    .ai-category-status.no-match { flex-wrap: wrap; justify-content: space-between; }
    .btn-structure {
        display: inline-flex; align-items: center; gap: 0.5rem; background: #3b82f6; color: #fff; border: none;
        border-radius: 8px; padding: 0.55rem 1rem; font-weight: 700; font-size: 0.9rem; cursor: pointer;
    }
    .btn-structure:hover:not(:disabled) { background: #2563eb; }
    .btn-structure:disabled { opacity: 0.8; cursor: wait; }
    .btn-structure-secondary { background: #ffffff; color: #1d4ed8; border: 1px solid #93c5fd; }
    .btn-structure-secondary:hover:not(:disabled) { background: #eff6ff; }
    .struct-panel { border: 1px solid #bfdbfe; background: #f8fbff; border-radius: 10px; padding: 1.25rem; margin-bottom: 1.25rem; }
    .struct-title { font-weight: 700; color: #1d4ed8; margin-bottom: 1rem; }
    .struct-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .struct-box { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.9rem; display: flex; flex-direction: column; gap: 0.6rem; }
    .struct-label { font-weight: 700; color: #334155; font-size: 0.9rem; }
    .struct-modes { display: flex; gap: 1rem; font-size: 0.85rem; color: #475569; flex-wrap: wrap; }
    .struct-modes label { display: flex; align-items: center; gap: 0.3rem; cursor: pointer; white-space: nowrap; }
    .struct-input-new { font-weight: 700; color: #15803d; }
    .struct-filters { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 0.75rem; margin-top: 0.6rem; }
    .struct-filter { display: flex; gap: 0.6rem; align-items: flex-start; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.75rem; cursor: pointer; }
    .struct-filter.is-new { background: #f0fdf4; border-color: #bbf7d0; cursor: default; }
    .struct-filter > input[type="checkbox"] { margin-top: 0.2rem; width: 1.05rem; height: 1.05rem; flex-shrink: 0; cursor: pointer; }
    .struct-filter-body { display: flex; flex-direction: column; gap: 0.35rem; min-width: 0; flex: 1; }
    .struct-filter-body small { color: #64748b; font-size: 0.78rem; overflow-wrap: anywhere; }
    .struct-filter-head { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
    .struct-badge { font-size: 0.7rem; font-weight: 700; padding: 0.1rem 0.5rem; border-radius: 999px; background: #dbeafe; color: #1d4ed8; }
    .struct-badge.new { background: #dcfce7; color: #15803d; }
    .struct-empty { color: #64748b; }
    .struct-actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.25rem; flex-wrap: wrap; }
    @media (max-width: 640px) {
        .struct-grid { grid-template-columns: 1fr; }
        .struct-actions > button { flex: 1; }
    }

    /* Anzeige des verwendeten KI-Modells */
    .ai-model-row { margin: 0.25rem 0 1rem 0; display: flex; justify-content: center; }
    .ai-model-exhausted { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 8px; padding: 0.5rem 0.75rem; font-size: 0.85rem; font-weight: 600; }

    /* Bild drehen */
    .btn-rotate { background: #ffffff; color: #334155; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0.5rem 0.9rem; font-weight: 600; cursor: pointer; }
    .btn-rotate:hover:not(:disabled) { background: #f1f5f9; border-color: #94a3b8; }
    .btn-rotate:disabled { opacity: 0.6; cursor: wait; }
</style>