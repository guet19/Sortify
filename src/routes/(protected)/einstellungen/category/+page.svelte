<script>
  import { enhance } from "$app/forms";
  import { onMount } from "svelte";
  import { browser } from "$app/environment";

  let { data, form } = $props();

  function focus(node) {
    node.focus();
  }

  let newMainName = $state("");
  let newSubName = $state("");
  let searchQuery = $state("");
  let expandedId = $state(null);
  let showSubGuide = $state(false); 

  let activeMainId = $state(null);
  let activeSubId = $state(null);
  let attributeSearchQuery = $state("");

  let successMessage = $state("");

  // State für Umbenennen der Hauptkategorie
  let editingMainId = $state(null);
  let editMainName = $state("");

  // State für Umbenennen der Unterkategorie
  let editingSubId = $state(null);
  let editingSubMainId = $state(null);
  let editSubName = $state("");

  let confirmDeleteMainId = $state(null);

  onMount(() => {
    if (browser) {
      const savedMain = sessionStorage.getItem("restoreMainId");
      const savedSub = sessionStorage.getItem("restoreSubId");
      
      if (savedMain && savedSub) {
        activeMainId = savedMain;
        activeSubId = savedSub;
        sessionStorage.removeItem("restoreMainId");
        sessionStorage.removeItem("restoreSubId");
        sessionStorage.removeItem("restoreSubName"); 
      }
    }
  });

  function jumpToFilterCreation() {
    if (browser) {
      sessionStorage.setItem("restoreMainId", activeMainId);
      sessionStorage.setItem("restoreSubId", activeSubId);
      sessionStorage.setItem("restoreSubName", activeSubcategory.name); 
      window.location.href = "/einstellungen/filter_attributes";
    }
  }

  let sortedCategories = $derived(
    [...(data.categories || [])].sort((a, b) =>
      a.name.localeCompare(b.name, "de"),
    ),
  );

  let filteredCategories = $derived(
    searchQuery.trim() === ""
      ? sortedCategories
      : sortedCategories.reduce((acc, cat) => {
          const query = searchQuery.toLowerCase().trim();
          const catName = cat.name || "";
          const mainMatches = catName.toLowerCase().includes(query);

          const matchingSubs = (cat.subcategories || []).filter((sub) =>
            (sub.name || "").toLowerCase().includes(query),
          );

          if (mainMatches) {
            acc.push(cat);
          } else if (matchingSubs.length > 0) {
            acc.push({ ...cat, subcategories: matchingSubs });
          }
          return acc;
        }, []),
  );

  function toggleCategory(id) {
    if (searchQuery.trim() !== "") return;
    expandedId = expandedId === id ? null : id;
    newSubName = "";
    confirmDeleteMainId = null;
  }

  // --- UMBENENNEN FUNKTIONEN ---
  function startEditMain(category) {
    editingMainId = category._id;
    editMainName = category.name;
    confirmDeleteMainId = null;
    cancelEditSub(); 
  }
  function cancelEditMain() {
    editingMainId = null;
    editMainName = "";
  }

  function startEditSub(mainId, sub) {
    editingSubMainId = mainId;
    editingSubId = sub.id;
    editSubName = sub.name;
    cancelEditMain(); 
  }
  function cancelEditSub() {
    editingSubMainId = null;
    editingSubId = null;
    editSubName = "";
  }

  function closeGuide() {
    showSubGuide = false;
  }

  let activeCategory = $derived(
    data.categories?.find((c) => c._id === activeMainId),
  );
  let activeSubcategory = $derived(
    activeCategory?.subcategories?.find((s) => s.id === activeSubId),
  );

  let filteredAttributes = $derived(
    (data.filterAttributes || [])
      .filter((attr) =>
        attr.label
          .toLowerCase()
          .includes(attributeSearchQuery.toLowerCase().trim()),
      )
      .sort((a, b) => a.label.localeCompare(b.label, "de")),
  );

  function openAttributeEdit(mainId, subId) {
    activeMainId = mainId;
    activeSubId = subId;
    attributeSearchQuery = "";
    successMessage = "";
    window.scrollTo(0, 0);
  }

  function closeAttributeEdit() {
    activeMainId = null;
    activeSubId = null;
  }
</script>

<div class="container mt-4 mb-5 space-grotesk">
  <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
    <h2>Kategorien verwalten</h2>

    <div class="d-flex align-items-center gap-2">
      <a href="/einstellungen/filter_attributes" class="btn btn-primary shadow-sm fw-bold">
        <i class="bi bi-sliders me-1"></i> Filterverwaltung
      </a>

      {#if activeMainId && activeSubId}
        <button class="btn btn-outline-secondary shadow-sm fw-bold btn-light-outline" onclick={closeAttributeEdit}>
          <i class="bi bi-arrow-left me-1"></i> Zurück zur Übersicht
        </button>
      {/if}
    </div>
  </div>

  {#if successMessage !== ""}
    <div class="alert alert-success shadow-sm animate-fade-in d-flex align-items-center gap-2 mb-4" style="z-index: 1050; position: relative;">
      <i class="bi bi-check-circle-fill"></i>
      {successMessage}
    </div>
  {/if}

  <div class="row">
    {#if activeCategory && activeSubcategory}
      <div class="col-12 animate-fade-in">
        <div class="card shadow-sm border-0 overflow-hidden light-card">
          <div class="card-header p-4 d-flex justify-content-between align-items-center" style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <div>
              <span class="mt-5 fw-bold" style="font-size: 30px; color: #22c55e;">
                {activeSubcategory.name}
              </span>
              <br />
              <span class="small text-uppercase fw-bold" style="color: #64748b;">
                Filterattribute der Kategorie zuweisen
              </span>
              <h3 class="h4 mb-0 mt-1 d-flex align-items-center gap-2">
                <i class="bi bi-chevron-right text-secondary" style="font-size: 1rem; color: #94a3b8 !important;"></i>
              </h3>
            </div>
            <div class="badge fs-6 rounded-pill" style="background-color: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;">
              {activeSubcategory.allowed_attributes?.length || 0} Filter aktiv
            </div>
          </div>

          <div class="card-body p-4" style="background-color: #ffffff;">
            <form
              method="POST"
              action="?/updateAttributes"
              use:enhance={() => {
                return async ({ result, update }) => {
                  await update();
                  if (result.type === "success") {
                    successMessage = `Attribute für "${activeSubcategory.name}" erfolgreich gespeichert!`;
                    closeAttributeEdit();
                    setTimeout(() => { successMessage = ""; }, 3500);
                  }
                };
              }}
            >
              <input type="hidden" name="mainId" value={activeCategory._id} />
              <input type="hidden" name="subId" value={activeSubcategory.id} />

              <div class="input-group mb-4 shadow-sm">
                <span class="input-group-text light-input-group-text border-end-0 py-3"><i class="bi bi-search" style="color: #64748b;"></i></span>
                <input
                  type="text"
                  class="form-control light-input border-start-0 py-3 fs-5"
                  placeholder="Spezifisches Attribut suchen (z.B. Gewinde, Material)..."
                  bind:value={attributeSearchQuery}
                />
                {#if attributeSearchQuery !== ""}
                  <button class="btn light-input border border-start-0" style="border-color: #cbd5e1 !important; color: #64748b;" type="button" onclick={() => (attributeSearchQuery = "")}><i class="bi bi-x-lg"></i></button>
                {/if}
              </div>

              <div class="light-card border-light rounded shadow-sm p-4 mb-4" style="border: 1px solid #e2e8f0;">
                <div class="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2" style="border-color: #e2e8f0 !important;">
                  <h5 class="h6 mb-0 fw-bold" style="color: #334155;">
                    {attributeSearchQuery === "" ? "Alle verfügbaren Attribute:" : "Suchergebnisse:"}
                  </h5>
                  <button type="button" class="btn btn-sm btn-outline-primary fw-bold" onclick={jumpToFilterCreation}>
                    <i class="bi bi-plus-circle me-1"></i> Neuen Filter anlegen
                  </button>
                </div>

                <div class="row g-3">
                  {#each filteredAttributes as attr}
                    <div class="col-md-6 col-lg-4">
                      <div class="form-check p-3 rounded h-100 d-flex align-items-center form-check-custom" style="border: 1px solid #e2e8f0; background: #ffffff;">
                        <input
                          class="form-check-input ms-0 me-3 mt-0 flex-shrink-0 light-checkbox"
                          style="width: 1.5em; height: 1.5em; cursor: pointer;"
                          type="checkbox"
                          name="attributes"
                          value={attr._id}
                          id="attr-{attr._id}"
                          checked={activeSubcategory.allowed_attributes?.includes(attr._id)}
                        />
                        <label class="form-check-label w-100 d-flex flex-column" style="cursor: pointer; color: #1e293b;" for="attr-{attr._id}">
                          <span class="fw-bold fs-6">{attr.label}</span>
                          <span style="font-size: 0.75rem; color: #64748b;">
                            Typ: {attr.ui_type === "select" ? (attr.is_multiple ? "Multi-Dropdown" : "Dropdown") : attr.ui_type}
                          </span>
                        </label>
                      </div>
                    </div>
                  {:else}
                    <div class="col-12">
                      <div class="alert alert-warning mb-0 d-flex justify-content-between align-items-center">
                        <span>Kein passendes Attribut gefunden.</span>
                        <button type="button" class="btn btn-sm btn-primary fw-bold shadow-sm" onclick={jumpToFilterCreation}>
                          <i class="bi bi-plus-lg me-1"></i> Direkt anlegen
                        </button>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>

              <div class="d-flex justify-content-end align-items-center mt-4 pt-3 border-top flex-wrap gap-3" style="border-color: #e2e8f0 !important;">
                <div class="d-flex gap-2">
                  <button type="button" class="btn btn-outline-secondary px-4 btn-light-outline" onclick={closeAttributeEdit}>Abbrechen</button>
                  <button type="submit" class="btn btn-success px-5 fw-bold shadow-sm"><i class="bi bi-save me-2"></i> Zuweisung speichern</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
      
    {:else}
      <div class="col-md-4 mb-4 animate-fade-in">
        <div class="card shadow-sm border-0 light-card p-4 sticky-top" style="top: 2rem;">
          <h3 class="h5 mb-3 text-title-dark fw-bold">Neue Hauptkategorie erstellen</h3>
          <form
            method="POST"
            action="?/createMain"
            use:enhance={() => {
              return async ({ result, update }) => {
                await update();
                if (result.type === "success" && result.data?.newId) {
                  expandedId = result.data.newId;
                  showSubGuide = true;
                  setTimeout(() => { showSubGuide = false; }, 8000);
                }
                newMainName = "";
              };
            }}
          >
            <div class="mb-3">
              <label for="mainName" class="form-label small fw-bold" style="color: #64748b;">Bezeichnung</label>
              <input type="text" id="mainName" name="name" class="form-control light-input" bind:value={newMainName} required />
            </div>
            <button type="submit" class="btn btn-primary w-100 fw-bold shadow-sm">Hauptkategorie anlegen</button>
          </form>
        </div>
      </div>

      <div class="col-md-8 animate-fade-in">
        <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
          <h3 class="h5 mb-0 fw-bold">Kategorien-Struktur</h3>
          <div class="input-group shadow-sm" style="max-width: 300px;">
            <span class="input-group-text light-input-group-text border-end-0"><i class="bi bi-search" style="color: #64748b;"></i></span>
            <input type="text" class="form-control light-input border-start-0 ps-0" placeholder="Kategorien suchen..." bind:value={searchQuery} />
            {#if searchQuery !== ""}
              <button class="btn light-input border-start-0" style="border-color: #cbd5e1 !important; color: #64748b;" type="button" onclick={() => (searchQuery = "")}><i class="bi bi-x-lg"></i></button>
            {/if}
          </div>
        </div>

        <div class="list-group shadow-sm" style="border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
          {#each filteredCategories as category (category._id)}
            <div class="list-group-item p-0 border-0 light-list-item {expandedId === category._id ? 'expanded-item shadow-sm' : ''}" style="border-bottom: 1px solid #e2e8f0 !important;">
              <div class="w-100 p-3 d-flex justify-content-between align-items-center">
                {#if editingMainId === category._id}
                  <form
                    method="POST"
                    action="?/renameMain"
                    class="w-100 d-flex gap-2 m-0"
                    use:enhance={() => {
                      return async ({ result, update }) => {
                        await update();
                        if (result.type === "success") {
                          successMessage = `Hauptkategorie erfolgreich umbenannt!`;
                          editingMainId = null;
                          setTimeout(() => { successMessage = ""; }, 3000);
                        }
                      };
                    }}
                  >
                    <input type="hidden" name="id" value={category._id} />
                    <input type="text" name="newName" class="form-control form-control-sm light-input" bind:value={editMainName} required use:focus />
                    <button type="submit" class="btn btn-sm btn-success flex-shrink-0 fw-bold"><i class="bi bi-check-lg"></i> Speichern</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary flex-shrink-0 btn-light-outline" onclick={cancelEditMain}><i class="bi bi-x-lg"></i></button>
                  </form>
                {:else}
                  {@const mainProductCount = data.articles?.filter((a) => a.mainCategoryId === category._id).length || 0}
                  
                  <div
                    class="d-flex align-items-center gap-2 flex-grow-1"
                    style="cursor: pointer;"
                    onclick={() => toggleCategory(category._id)}
                    role="button"
                    tabindex="0"
                    onkeydown={(e) => e.key === "Enter" && toggleCategory(category._id)}
                  >
                    <span class="fw-bold fs-5 text-title-dark">{category.name}</span>

                    {#if !category.subcategories || category.subcategories.length === 0}
                      <span class="badge bg-danger rounded-pill" title="Achtung: Unvollständig">
                        keine Unterkategorie festgelegt <i class="bi bi-exclamation-circle ms-1"></i>
                      </span>
                    {:else}
                      <span class="badge rounded-pill" style="background-color: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;" title="Unterkategorien">
                        {category.subcategories.length} {category.subcategories.length === 1 ? 'Unterkategorie' : 'Unterkategorien'}
                        <i class="bi bi-folder2-open ms-1"></i>
                      </span>
                      <span class="badge bg-primary rounded-pill" title="Erfasste Produkte">
                        {mainProductCount} erfasste Produkte <i class="bi bi-box-seam ms-1"></i>
                      </span>
                    {/if}
                  </div>

                  <div class="d-flex align-items-center gap-1">
                    <button
                      type="button"
                      class="btn btn-sm border-0 p-1 me-1 icon-btn"
                      aria-label="Hauptkategorie umbenennen"
                      title="Hauptkategorie bearbeiten"
                      onclick={() => startEditMain(category)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/>
                      </svg>
                    </button>

                    <button
                      type="button"
                      class="btn btn-sm text-danger border-0 p-1 icon-btn-danger"
                      aria-label="Hauptkategorie löschen"
                      title="Hauptkategorie löschen"
                      onclick={() => {
                        if (!category.subcategories || category.subcategories.length === 0) {
                          const hasArticles = data.articles?.some((a) => a.mainCategoryId === category._id);
                          if (hasArticles) {
                            alert(`Die Hauptkategorie "${category.name}" kann nicht gelöscht werden, da sich noch Artikel darin befinden.`);
                            return;
                          }
                          if (confirm(`Möchten Sie die Hauptkategorie "${category.name}" wirklich löschen?`)) {
                            const formData = new FormData();
                            formData.append("mainId", category._id);
                            fetch("?/deleteMain", { method: "POST", body: formData }).then(() => location.reload());
                          }
                        } else {
                          confirmDeleteMainId = category._id;
                          expandedId = category._id;
                          editingMainId = null;
                          window.scrollTo(0, document.getElementById(`category-${category._id}`).offsetTop - 20);
                        }
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
                        <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      class="btn btn-sm border-0 ms-2 icon-btn"
                      aria-label="Auf/Zuklappen"
                      onclick={() => toggleCategory(category._id)}
                    >
                      <i class="bi {expandedId === category._id || searchQuery.trim() !== '' ? 'bi-chevron-up' : 'bi-chevron-down'} text-title-dark"></i>
                    </button>
                  </div>
                {/if}
              </div>

              {#if expandedId === category._id || searchQuery.trim() !== ""}
                <div class="p-3 border-top light-expanded-area" id="category-{category._id}">
                  {#if confirmDeleteMainId === category._id}
                    <div class="rounded p-4 mb-4 animate-fade-in position-relative shadow-sm" style="background-color: #fef2f2; border: 1px solid #fecaca;">
                      <h5 class="d-flex align-items-center gap-2 mb-3 fw-bold" style="color: #b91c1c;">
                        <i class="bi bi-exclamation-triangle-fill fs-4"></i> Sicherheitsrelevante Löschung
                      </h5>
                      <p class="mb-4" style="font-size: 0.95rem; color: #7f1d1d;">
                        Um die Hauptkategorie <strong>"{category.name}"</strong> zu löschen, müssen Sie zwingend zuerst <strong style="color: #b91c1c;">alle</strong> darin enthaltenen Unterkategorien manuell entfernen.
                      </p>

                      <p class="mb-2 small fw-bold text-uppercase" style="color: #7f1d1d;">Schritt 1: Alle Unterkategorien auswählen und löschen</p>

                      <form method="POST" action="?/bulkDeleteSubs" use:enhance={() => { return async ({ result, update }) => { await update(); if (result.type === "success") { successMessage = "Ausgewählte Unterkategorien gelöscht!"; setTimeout(() => (successMessage = ""), 3000); } }; }}>
                        <input type="hidden" name="mainId" value={category._id} />
                        <div class="rounded mb-4 light-card" style="max-height: 250px; overflow-y: auto; border: 1px solid #cbd5e1;">
                          {#each [...category.subcategories].sort((a, b) => a.name.localeCompare(b.name, "de")) as sub}
                            <div class="form-check p-3 m-0 d-flex align-items-center gap-3 border-bottom form-check-custom" style="border-color: #e2e8f0 !important;">
                              <input class="form-check-input mt-0 ms-2 light-checkbox" type="checkbox" name="subIds" value={sub.id} id="bulk-{sub.id}" style="width: 1.25em; height: 1.25em;" required />
                              <label class="form-check-label fw-bold w-100" for="bulk-{sub.id}" style="cursor:pointer; font-size: 1rem; color: #1e293b;">{sub.name}</label>
                            </div>
                          {/each}
                        </div>
                        <div class="d-flex justify-content-between align-items-center gap-3">
                          <button type="button" class="btn btn-outline-secondary px-4 btn-light-outline fw-bold" onclick={() => (confirmDeleteMainId = null)}>Abbrechen</button>
                          <button type="submit" class="btn btn-danger fw-bold shadow-sm px-4">Ausgewählte Unterkategorien löschen</button>
                        </div>
                      </form>

                      {#if category.subcategories.length === 0}
                        <div class="animate-fade-in mt-4 border-top pt-4" style="border-color: #fecaca !important;">
                          <p class="mb-3 small fw-bold text-uppercase" style="color: #166534;">Schritt 2: Leere Hauptkategorie löschen</p>
                          <form method="POST" action="?/deleteMain" onsubmit={(e) => { if (!confirm(`Möchten Sie die nun leere Hauptkategorie "${category.name}" endgültig löschen?`)) e.preventDefault(); }} use:enhance={() => { return async ({ result, update }) => { await update(); if (result.type === "success") location.reload(); }; }}>
                            <input type="hidden" name="mainId" value={category._id} />
                            <button type="submit" class="btn btn-outline-danger w-100 fw-bold shadow-sm btn-light-danger">Hauptkategorie "{category.name}" endgültig löschen</button>
                          </form>
                        </div>
                      {/if}
                    </div>
                  {/if}

                  <h6 class="small fw-bold mb-3 text-uppercase" style="color: #64748b;">
                    Unterkategorien
                  </h6>

                  {#if category.subcategories && category.subcategories.length > 0}
                    {@const sortedSubs = [...category.subcategories].sort((a, b) => a.name.localeCompare(b.name, "de"))}

                    <div class="d-flex flex-column gap-2 mb-4">
                      {#each sortedSubs as sub}
                        {#if editingSubId === sub.id && editingSubMainId === category._id}
                          <div class="light-card rounded px-3 py-3 shadow-sm border-light">
                            <form
                              method="POST"
                              action="?/renameSub"
                              class="w-100 d-flex gap-2 m-0"
                              use:enhance={() => {
                                return async ({ result, update }) => {
                                  await update();
                                  if (result.type === "success") {
                                    successMessage = `Unterkategorie erfolgreich umbenannt!`;
                                    cancelEditSub();
                                    setTimeout(() => { successMessage = ""; }, 3000);
                                  }
                                };
                              }}
                            >
                              <input type="hidden" name="mainId" value={category._id} />
                              <input type="hidden" name="subId" value={sub.id} />
                              <input type="text" name="newName" class="form-control form-control-sm light-input" bind:value={editSubName} required use:focus />
                              <button type="submit" class="btn btn-sm btn-success flex-shrink-0 fw-bold"><i class="bi bi-check-lg"></i> Speichern</button>
                              <button type="button" class="btn btn-sm btn-outline-secondary flex-shrink-0 btn-light-outline" onclick={cancelEditSub}><i class="bi bi-x-lg"></i></button>
                            </form>
                          </div>
                        
                        {:else}
                          {@const subProductCount = data.articles?.filter((a) => a.subcategoryId === sub.id).length || 0}
                          
                          <div class="light-card rounded px-3 py-3 shadow-sm d-flex justify-content-between align-items-center border-light">
                            <div class="d-flex flex-column">
                              <span class="fw-bold fs-6 text-title-dark">{sub.name}</span>

                              <div class="d-flex align-items-center gap-3 mt-1">
                                <small style="color: #64748b;"><i class="bi bi-funnel me-1"></i> {sub.allowed_attributes?.length || 0} Filter</small>
                                <small style="color: #64748b;"><i class="bi bi-box-seam me-1"></i> {subProductCount} {subProductCount === 1 ? "Produkt" : "Produkte"}</small>
                              </div>
                            </div>
                            <div class="d-flex align-items-center gap-2">
                              <button type="button" class="btn btn-sm fw-bold px-3 shadow-sm me-2 btn-light-action" onclick={() => openAttributeEdit(category._id, sub.id)}>
                                <i class="bi bi-sliders me-1"></i> Filter zuweisen
                              </button>

                              <button
                                type="button"
                                class="btn btn-sm border-0 p-1 me-1 icon-btn"
                                aria-label="Unterkategorie bearbeiten"
                                title="Unterkategorie bearbeiten"
                                onclick={() => startEditSub(category._id, sub)}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                                  <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/>
                                </svg>
                              </button>

                              <form
                                method="POST"
                                action="?/deleteSub"
                                style="margin: 0; display: inline-block;"
                                onsubmit={(e) => {
                                  const hasArticles = data.articles?.some((a) => a.subcategoryId === sub.id);
                                  if (hasArticles) {
                                    alert(`Die Unterkategorie "${sub.name}" kann nicht gelöscht werden, da sich noch Artikel darin befinden.`);
                                    e.preventDefault();
                                    return;
                                  }
                                  if (!confirm(`Möchten Sie die Unterkategorie "${sub.name}" wirklich löschen?`)) {
                                    e.preventDefault();
                                  }
                                }}
                                use:enhance={() => {
                                  return async ({ result, update }) => {
                                    await update();
                                    if (result.type === "success") {
                                      successMessage = "Unterkategorie gelöscht!";
                                      setTimeout(() => (successMessage = ""), 3000);
                                    }
                                  };
                                }}
                              >
                                <input type="hidden" name="mainId" value={category._id} />
                                <input type="hidden" name="subId" value={sub.id} />
                                <button type="submit" class="btn btn-sm text-danger border-0 p-1 icon-btn-danger" aria-label="Unterkategorie löschen" title="Unterkategorie löschen">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
                                    <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" />
                                  </svg>
                                </button>
                              </form>
                            </div>
                          </div>
                        {/if}
                      {/each}
                    </div>
                  {:else}
                    <p class="small fst-italic mb-4" style="color: #64748b;">Noch keine Unterkategorien vorhanden.</p>
                  {/if}

                  {#if searchQuery.trim() === ""}
                    <div class="p-3 rounded position-relative light-card" style="border: 1px dashed #cbd5e1;">
                      {#if showSubGuide && expandedId === category._id}
                        <div class="info-guide-bubble shadow animate-pop-in">
                          <div class="d-flex justify-content-between align-items-start gap-2">
                            <span><strong>Hauptkategorie erstellt!</strong> Legen Sie jetzt hier Ihre Unterkategorien fest (z.B. Schrauben, Dübel).</span>
                            <button type="button" class="btn-close btn-close-white" style="font-size: 0.6rem" onclick={closeGuide}></button>
                          </div>
                          <div class="bubble-arrow"></div>
                        </div>
                      {/if}

                      <label for="subName-{category._id}" class="form-label small fw-bold" style="color: #334155;">Neue Unterkategorie in "{category.name}" hinzufügen</label>
                      <form method="POST" action="?/createSub" use:enhance={() => { return async ({ update }) => { await update(); showSubGuide = false; newSubName = ""; }; }}>
                        <input type="hidden" name="mainId" value={category._id} />
                        <div class="input-group shadow-sm">
                          <input type="text" id="subName-{category._id}" name="subName" class="form-control light-input" placeholder="z.B. Schrauben..." bind:value={newSubName} required use:focus />
                          <button class="btn btn-primary px-4 fw-bold" type="submit"><i class="bi bi-plus-lg me-1"></i> Hinzufügen</button>
                        </div>
                      </form>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
        {#if filteredCategories.length === 0}
          <div class="alert alert-info mt-4" style="background-color: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe;">Keine Kategorien gefunden.</div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  /* Globale Font & Farben */
  .space-grotesk { font-family: "Space Grotesk", sans-serif; color: #334155; }
  h2, h3, h5, h6 { color: #22c55e; }
  .text-title-dark { color: #1e293b; }
  .text-muted-custom { color: #64748b; }
  
  /* Light Mode Karten & Hintergründe */
  .light-card { background-color: #ffffff; border: 1px solid #e2e8f0; color: #334155; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
  .light-expanded-area { background-color: #f8fafc; border-top: 1px solid #e2e8f0; }
  .border-light { border-color: #e2e8f0 !important; }
  
  /* Input Felder */
  .light-input { 
    background-color: #ffffff !important; 
    color: #334155 !important; 
    border-color: #cbd5e1 !important; 
    box-shadow: none !important;
    transition: all 0.2s;
  }
  .light-input:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1) !important; outline: none; }
  .light-input-group-text { background-color: #f8fafc !important; border-color: #cbd5e1 !important; border-right: none !important; color: #64748b !important; }
  
  /* Checkboxen */
  .light-checkbox { border: 1px solid #cbd5e1; cursor: pointer; }
  .light-checkbox:checked { background-color: #3b82f6; border-color: #3b82f6; }
  
  /* Listen-Elemente */
  .light-list-item { background-color: #ffffff; color: #334155; transition: background-color 0.2s; border-bottom: 1px solid #e2e8f0 !important; }
  .expanded-item { border-color: #3b82f6 !important; border-width: 2px !important; }
  .light-list-item button:hover { background-color: #f8fafc !important; }
  
  /* Hover Effekte */
  .form-check-custom { transition: all 0.2s ease-in-out; }
  .form-check-custom:hover { background-color: #f8fafc; }
  .icon-btn { color: #94a3b8; transition: color 0.2s; background: transparent; }
  .icon-btn:hover { color: #1e293b; }
  .icon-btn-danger { color: #f87171; transition: color 0.2s; background: transparent; }
  .icon-btn-danger:hover { color: #ef4444; }
  
  /* Buttons */
  .btn-light-outline { color: #334155; border-color: #cbd5e1; background: #ffffff; }
  .btn-light-outline:hover { background-color: #f1f5f9; color: #1e293b; border-color: #94a3b8; }
  .btn-light-action { background-color: #ffffff; color: #334155; border: 1px solid #cbd5e1; }
  .btn-light-action:hover { background-color: #f8fafc; border-color: #94a3b8; }
  .btn-light-danger { border-color: #f87171; color: #ef4444; background: transparent; }
  .btn-light-danger:hover { background-color: #fee2e2; color: #b91c1c; border-color: #ef4444; }

  /* Alerts / Warnungen */
  .alert-success { background: #dcfce7 !important; color: #166534 !important; border: 1px solid #bbf7d0 !important; }
  .alert-warning { background: #fef3c7 !important; color: #b45309 !important; border: 1px solid #fde68a !important; }

  /* Animationen */
  .animate-fade-in { animation: fadeIn 0.3s ease-out; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
  
  /* Bubble */
  .info-guide-bubble { position: absolute; bottom: 110%; left: 50%; transform: translateX(-50%); background-color: #3b82f6; color: white; padding: 12px 16px; border-radius: 12px; font-size: 0.9rem; z-index: 100; width: 90%; max-width: 350px; border: 1px solid #60a5fa; }
  .bubble-arrow { position: absolute; top: 100%; left: 50%; transform: translateX(-50%); border-left: 10px solid transparent; border-right: 10px solid transparent; border-top: 10px solid #3b82f6; }
  @keyframes popIn { 0% { opacity: 0; transform: translateX(-50%) scale(0.9) translateY(10px); } 100% { opacity: 1; transform: translateX(-50%) scale(1) translateY(0); } }
  .animate-pop-in { animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
</style>