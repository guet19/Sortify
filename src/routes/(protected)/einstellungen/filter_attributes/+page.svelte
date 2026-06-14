<script>
  import { enhance } from "$app/forms";
  import { onMount } from "svelte";
  import { browser } from "$app/environment";

  let { data, form } = $props();

  // --- NEU: State für den Rückkehr-Banner ---
  let returnToSubName = $state(null);

  onMount(() => {
    if (browser) {
      returnToSubName = sessionStorage.getItem("restoreSubName");
    }
  });

  // --- STATE: ÜBERSICHT (Erstellen & Liste) ---
  let label = $state("");
  let ui_type = $state("text");
  let unit = $state("");
  let currentOption = $state("");
  let optionsList = $state([]);
  let isMultiple = $state(false);

  let searchQuery = $state("");
  let expandedId = $state(null);
  let successMessage = $state("");

  // States für die Quick-Actions (Inline-Editing)
  let quickOptionSearchQuery = $state("");
  let quickNewOption = $state("");

  // --- STATE: FOCUS-MODUS (Bearbeiten) ---
  let activeAttributeId = $state(null);
  let editLabel = $state("");
  let editUiType = $state("text");
  let editUnit = $state("");
  let editCurrentOption = $state("");
  let editOptionsList = $state([]);
  let editIsMultiple = $state(false);
  let optionSearchQuery = $state("");

  // --- DATEN-LOGIK ---
  let sortedAttributes = $derived(
    [...(data.attributeLibrary || [])].sort((a, b) =>
      a.label.localeCompare(b.label, "de"),
    ),
  );

  let filteredAttributes = $derived(
    searchQuery.trim() === ""
      ? sortedAttributes
      : sortedAttributes.filter((attr) => {
          const query = searchQuery.toLowerCase().trim();
          const labelMatch = attr.label.toLowerCase().includes(query);
          const optionsMatch =
            attr.options &&
            attr.options.some((opt) => opt.toLowerCase().includes(query));
          return labelMatch || optionsMatch;
        }),
  );

  let activeAttribute = $derived(
    data.attributeLibrary?.find((a) => a._id === activeAttributeId),
  );
  let filteredEditOptions = $derived(
    optionSearchQuery.trim() === ""
      ? editOptionsList
      : editOptionsList.filter((opt) =>
          opt.toLowerCase().includes(optionSearchQuery.toLowerCase().trim()),
        ),
  );

  // --- FUNKTIONEN ---
  function toggleAttribute(id) {
    if (searchQuery.trim() !== "") return;
    expandedId = expandedId === id ? null : id;
    // Setzt die Quick-Suchfelder beim Wechseln zurück
    quickOptionSearchQuery = "";
    quickNewOption = "";
  }

  function addOption() {
    if (currentOption.trim() && !optionsList.includes(currentOption.trim())) {
      optionsList.push(currentOption.trim());
      currentOption = "";
    }
  }

  function removeOption(optValue) {
    optionsList = optionsList.filter((o) => o !== optValue);
  }

  function openEditMode(attr) {
    activeAttributeId = attr._id;
    editLabel = attr.label;
    editUiType = attr.ui_type;
    editUnit = attr.unit || "";
    editIsMultiple = attr.is_multiple || false;
    editOptionsList = [...(attr.options || [])];
    optionSearchQuery = "";
    successMessage = "";
    window.scrollTo(0, 0);
  }

  function closeEditMode() {
    activeAttributeId = null;
    optionSearchQuery = "";
  }

  function addEditOption() {
    if (
      editCurrentOption.trim() &&
      !editOptionsList.includes(editCurrentOption.trim())
    ) {
      editOptionsList.push(editCurrentOption.trim());
      editCurrentOption = "";
      optionSearchQuery = "";
    }
  }

  function removeEditOption(optValue) {
    editOptionsList = editOptionsList.filter((o) => o !== optValue);
  }
</script>

<div class="container mt-4 mb-5 space-grotesk">
  <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
    <h2>Filtermöglichkeiten verwalten</h2>
    
    <div class="d-flex align-items-center gap-2">
      <a href="/einstellungen/category" class="btn btn-primary shadow-sm fw-bold">
  <i class="bi bi-folder2-open me-1"></i> Zurück zur Kategorienverwaltung
</a>

      {#if activeAttributeId}
        <button
          class="btn btn-outline-secondary shadow-sm fw-bold btn-light-outline"
          onclick={closeEditMode}
        >
          <i class="bi bi-x-lg me-1"></i> Ansicht schließen
        </button>
      {/if}
    </div>
  </div>

  {#if returnToSubName}
    <div class="alert info-banner d-flex justify-content-between align-items-center shadow-sm mb-4 animate-fade-in p-3 rounded-3 flex-wrap gap-3">
      <div>
        <h4 class="alert-heading h5 mb-1 text-primary fw-bold">
          <i class="bi bi-info-circle-fill me-2"></i> Filtererstellung für "{returnToSubName}"
        </h4>
        <p class="mb-0 small text-title-dark">
          Legen Sie hier das fehlende Attribut an. Wenn Sie fertig sind, klicken Sie rechts, um zur Kategorie zurückzukehren und die Zuweisung abzuschließen.
        </p>
      </div>
      <a href="/einstellungen/category" class="btn btn-primary fw-bold shadow-sm px-4 flex-shrink-0">
        <i class="bi bi-arrow-left-circle me-2"></i> Zurück zu "{returnToSubName}"
      </a>
    </div>
  {/if}

  {#if successMessage !== ""}
    <div class="alert success-banner shadow-sm animate-fade-in d-flex align-items-center gap-2 mb-4">
      <i class="bi bi-check-circle-fill"></i>
      {successMessage}
    </div>
  {/if}

  <div class="row">
    {#if activeAttribute}
      <div class="col-12 animate-fade-in">
        <div class="card light-card overflow-hidden">
          <div class="card-header light-card-header p-4">
            <span class="text-muted-custom small text-uppercase fw-bold">Filterattribut bearbeiten</span>
            <h3 class="h4 mb-0 mt-1 text-title-dark">{activeAttribute.label}</h3>
          </div>

          <div class="card-body p-4" style="background: #ffffff;">
            <form
              method="POST"
              action="?/update"
              use:enhance={() => {
                return async ({ result, update }) => {
                  await update();
                  if (result.type === "success") {
                    successMessage = `Attribut erfolgreich aktualisiert!`;
                    closeEditMode();
                    setTimeout(() => {
                      successMessage = "";
                    }, 3500);
                  }
                };
              }}
            >
              <input type="hidden" name="id" value={activeAttribute._id} />
              <div class="row mb-4">
                <div class="col-md-4 mb-3">
                  <label for="editLabel" class="form-label small fw-bold text-muted-custom">Anzeigename</label>
                  <input
                    type="text"
                    id="editLabel"
                    name="label"
                    class="form-control light-input"
                    bind:value={editLabel}
                    required
                  />
                </div>
                <div class="col-md-4 mb-3">
                  <label for="editUiType" class="form-label small fw-bold text-muted-custom">Eingabetyp</label>
                  <select
                    id="editUiType"
                    name="ui_type"
                    class="form-select light-input"
                    bind:value={editUiType}
                  >
                    <option value="text">Freitext</option>
                    <option value="number">Zahl</option>
                    <option value="select">Dropdown (Auswahl)</option>
                  </select>
                </div>
                <div class="col-md-4 mb-3">
                  <label for="editUnit" class="form-label small fw-bold text-muted-custom">Einheit</label>
                  <input
                    type="text"
                    id="editUnit"
                    name="unit"
                    class="form-control light-input"
                    bind:value={editUnit}
                  />
                </div>
              </div>

              {#if editUiType === "select"}
                <div class="inner-box p-4 mb-4 rounded">
                  <div class="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom flex-wrap gap-3" style="border-color: #e2e8f0 !important;">
                    <h5 class="h6 text-title-dark mb-0 fw-bold">
                      Werte & Optionen verwalten
                    </h5>
                    <div class="form-check form-switch mb-0 d-flex align-items-center gap-2">
                      <input type="hidden" name="is_multiple" value={editIsMultiple} />
                      <input
                        class="form-check-input light-checkbox m-0"
                        type="checkbox"
                        id="editIsMultipleSwitch"
                        bind:checked={editIsMultiple}
                      />
                      <label class="form-check-label text-muted-custom small fw-bold" for="editIsMultipleSwitch">Mehrfachauswahl</label>
                    </div>
                  </div>

                  <div class="row align-items-center mb-4">
                    <div class="col-md-6 mb-2 mb-md-0">
                      <label class="form-label small text-muted-custom fw-bold">Suchen (Filtert die Liste unten)</label>
                      <div class="input-group input-group-sm shadow-sm">
                        <span class="input-group-text light-input-group-text"><i class="bi bi-search"></i></span>
                        <input
                          type="text"
                          class="form-control light-input"
                          placeholder="Option suchen..."
                          bind:value={optionSearchQuery}
                        />
                        {#if optionSearchQuery !== ""}
                          <button
                            class="btn btn-outline-secondary light-input"
                            style="border-left: none;"
                            type="button"
                            aria-label="Zurücksetzen"
                            onclick={() => (optionSearchQuery = "")}
                            ><i class="bi bi-x-lg"></i></button>
                        {/if}
                      </div>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small text-muted-custom fw-bold">Neuen Wert hinzufügen</label>
                      <div class="input-group input-group-sm shadow-sm">
                        <input
                          type="text"
                          class="form-control light-input"
                          placeholder="z.B. M5"
                          bind:value={editCurrentOption}
                          onkeydown={(e) => e.key === "Enter" && (e.preventDefault(), addEditOption())}
                        />
                        <button
                          type="button"
                          class="btn btn-primary flex-shrink-0 px-3 fw-bold"
                          aria-label="Hinzufügen"
                          onclick={addEditOption}
                          ><i class="bi bi-plus-lg me-1"></i>Hinzufügen</button>
                      </div>
                    </div>
                  </div>

                  <div class="light-options-container d-flex flex-wrap gap-2 p-3">
                    {#each filteredEditOptions as opt}
                      <span class="badge light-badge fs-6 d-flex align-items-center gap-2 shadow-sm py-2 px-3">
                        {opt}
                        <button
                          type="button"
                          class="btn-close"
                          style="font-size: 0.6rem"
                          aria-label="Entfernen"
                          onclick={() => removeEditOption(opt)}
                        ></button>
                      </span>
                    {:else}
                      <div class="text-muted-custom small w-100 text-center mt-3">
                        Keine Werte hinterlegt.
                      </div>
                    {/each}
                  </div>
                  <input type="hidden" name="options" value={editOptionsList.join(",")} />
                </div>
              {/if}

              <div class="d-flex justify-content-end gap-3 mt-4 pt-3 border-top" style="border-color: #e2e8f0 !important;">
                <button type="button" class="btn btn-outline-secondary btn-light-outline px-4" onclick={closeEditMode}>Abbrechen</button>
                <button type="submit" class="btn btn-success px-5 fw-bold shadow-sm">
                  <i class="bi bi-save me-2"></i> Änderungen speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {:else}
      <div class="col-md-4 mb-4 animate-fade-in">
        <div class="card light-card p-4 sticky-top light-scrollbar" style="top: 2rem; max-height: 85vh; overflow-y: auto;">
          <h3 class="h5 mb-3 text-title-dark fw-bold">Neues Filter-Attribut</h3>

          <form
            method="POST"
            action="?/create"
            use:enhance={() => {
              return async ({ result, update }) => {
                await update();
                if (result.type === "success") {
                  successMessage = `Attribut erfolgreich angelegt!`;
                  label = "";
                  unit = "";
                  optionsList = [];
                  isMultiple = false;
                  setTimeout(() => {
                    successMessage = "";
                  }, 3500);
                }
              };
            }}
          >
            <div class="mb-3">
              <label for="label" class="form-label small fw-bold text-muted-custom">Anzeigename</label>
              <input type="text" id="label" name="label" class="form-control light-input" bind:value={label} required />
            </div>
            <div class="mb-3">
              <label for="ui_type" class="form-label small fw-bold text-muted-custom">Eingabetyp</label>
              <select id="ui_type" name="ui_type" class="form-select light-input" bind:value={ui_type}>
                <option value="text">Freitext</option>
                <option value="number">Zahl</option>
                <option value="select">Dropdown</option>
              </select>
            </div>
            <div class="mb-3">
              <label for="unit" class="form-label small fw-bold text-muted-custom">Einheit (optional)</label>
              <input type="text" id="unit" name="unit" class="form-control light-input" bind:value={unit} />
            </div>

            {#if ui_type === "select"}
              <div class="mb-4 p-3 inner-box rounded">
                <div class="form-check form-switch m-0 d-flex align-items-center gap-2">
                  <input type="hidden" name="is_multiple" value={isMultiple} />
                  <input
                    class="form-check-input light-checkbox m-0"
                    type="checkbox"
                    id="isMultipleSwitch"
                    bind:checked={isMultiple}
                  />
                  <label class="form-check-label text-title-dark fw-bold small" for="isMultipleSwitch">Mehrfachauswahl erlauben</label>
                </div>
              </div>
              <div class="mb-3">
                <label for="optionInput" class="form-label small text-muted-custom fw-bold">Auswahl-Optionen</label>
                <div class="input-group mb-2 shadow-sm">
                  <input
                    type="text"
                    id="optionInput"
                    class="form-control light-input"
                    placeholder="z.B. M3"
                    bind:value={currentOption}
                    onkeydown={(e) => e.key === "Enter" && (e.preventDefault(), addOption())}
                  />
                  <button type="button" class="btn btn-primary flex-shrink-0 px-3 fw-bold" aria-label="Hinzufügen" onclick={addOption}><i class="bi bi-plus-lg"></i></button>
                </div>
                <div class="d-flex flex-wrap gap-2 mt-2">
                  {#each optionsList as opt}
                    <span class="badge light-badge-primary d-flex align-items-center gap-2 py-2 px-3 border">
                      {opt}
                      <button type="button" class="btn-close" style="font-size: 0.5rem" aria-label="Entfernen" onclick={() => removeOption(opt)}></button>
                    </span>
                  {/each}
                </div>
                <input type="hidden" name="options" value={optionsList.join(",")} />
              </div>
            {/if}
            <button type="submit" class="btn btn-primary w-100 fw-bold shadow-sm mt-2">Speichern</button>
          </form>
        </div>
      </div>

      <div class="col-md-8 animate-fade-in">
        <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
          <h3 class="h5 mb-0 fw-bold">Vorhandene Filtermöglichkeiten</h3>
          <div class="input-group shadow-sm" style="max-width: 300px;">
            <span class="input-group-text light-input-group-text"><i class="bi bi-search"></i></span>
            <input type="text" class="form-control light-input border-start-0 ps-0" placeholder="Filter durchsuchen..." bind:value={searchQuery} />
            {#if searchQuery !== ""}
              <button class="btn btn-outline-secondary light-input" style="border-left: none;" type="button" aria-label="Zurücksetzen" onclick={() => (searchQuery = "")}><i class="bi bi-x-lg"></i></button>
            {/if}
          </div>
        </div>

        <div class="list-group light-list-group">
          {#each filteredAttributes as attr}
            <div class="list-group-item list-group-item-action p-0 overflow-hidden light-list-item">
              <button
                class="w-100 border-0 bg-transparent p-3 d-flex justify-content-between align-items-center text-start"
                onclick={() => toggleAttribute(attr._id)}
                aria-expanded={expandedId === attr._id || searchQuery.trim() !== ""}
              >
                <div class="d-flex align-items-center gap-2">
                  <span class="fw-bold fs-5 text-title-dark">{attr.label}</span>
                  {#if attr.unit}
                    <span class="badge light-badge">Einheit: {attr.unit}</span>
                  {/if}
                  <span class="badge {attr.ui_type === 'select' ? 'light-badge-primary' : 'light-badge'} rounded-pill ms-2">
                    {attr.ui_type === "select" ? (attr.is_multiple ? "Multi-Dropdown" : "Dropdown") : attr.ui_type}
                  </span>
                </div>
                <i class="bi {expandedId === attr._id || searchQuery.trim() !== '' ? 'bi-chevron-up' : 'bi-chevron-down'} text-muted-custom"></i>
              </button>

              {#if expandedId === attr._id || searchQuery.trim() !== ""}
                <div class="p-3 light-expanded-area animate-fade-in">
                  {#if attr.ui_type === "select"}
                    <div class="d-flex justify-content-between align-items-center mb-3">
                      <h6 class="text-muted-custom small fw-bold mb-0 text-uppercase">Hinterlegte Optionen</h6>
                      <div class="input-group input-group-sm shadow-sm" style="width: 250px;">
                        <span class="input-group-text light-input-group-text"><i class="bi bi-search"></i></span>
                        <input type="text" class="form-control light-input border-start-0" placeholder="{attr.label} durchsuchen..." bind:value={quickOptionSearchQuery} />
                      </div>
                    </div>

                    {@const filteredQuickOptions = (attr.options || []).filter(o => o.toLowerCase().includes(quickOptionSearchQuery.toLowerCase().trim()))}

                    <div class="d-flex flex-wrap gap-2">
                      {#each filteredQuickOptions as option}
                        <form
                          method="POST"
                          action="?/removeOptionQuick"
                          use:enhance={() => {
                            return async ({ update }) => {
                              await update();
                              successMessage = `Wert "${option}" entfernt!`;
                              setTimeout(() => { successMessage = ""; }, 3000);
                            };
                          }}
                          class="m-0 p-0"
                        >
                          <input type="hidden" name="id" value={attr._id} />
                          <input type="hidden" name="option" value={option} />
                          <div class="badge light-badge px-3 py-2 shadow-sm d-flex align-items-center gap-2">
                            {option}
                            <button type="submit" class="btn-close" style="font-size: 0.6rem" aria-label="Entfernen"></button>
                          </div>
                        </form>
                      {:else}
                        <p class="text-muted-custom small fst-italic mb-0">Keine passenden Werte gefunden.</p>
                      {/each}
                    </div>
                  {:else}
                    <div class="alert info-banner py-2 mb-0 border-0" style="background: #eff6ff; color: #1e40af;">
                      <i class="bi bi-info-circle me-2"></i> Erlaubt freie {attr.ui_type === "number" ? "Zahlenwerte" : "Texteingaben"}.
                    </div>
                  {/if}

                  <div class="mt-4 pt-3 border-top d-flex justify-content-between align-items-center flex-wrap gap-3" style="border-color: #e2e8f0 !important;">
                    {#if attr.ui_type === "select"}
                      <form
                        method="POST"
                        action="?/addOptionQuick"
                        use:enhance={() => {
                          return async ({ result, update }) => {
                            await update();
                            if (result.type === "success") {
                              successMessage = `Wert erfolgreich hinzugefügt!`;
                              quickNewOption = ""; 
                              setTimeout(() => { successMessage = ""; }, 3000);
                            }
                          };
                        }}
                        style="width: 250px;"
                      >
                        <input type="hidden" name="id" value={attr._id} />
                        <div class="input-group input-group-sm shadow-sm">
                          <input type="text" name="newOption" class="form-control light-input border-end-0" placeholder="Neuen Wert hinzufügen..." bind:value={quickNewOption} required />
                          <button type="submit" class="btn btn-success fw-bold px-3"><i class="bi bi-plus-lg"></i></button>
                        </div>
                      </form>
                    {:else}
                      <div></div>
                    {/if}

                    <div class="d-flex gap-2">
                      <button class="btn btn-sm btn-outline-secondary btn-light-outline fw-bold px-3 shadow-sm" onclick={() => openEditMode(attr)}>
                        <i class="bi bi-pencil me-1"></i> Alles bearbeiten
                      </button>

                      <form
                        method="POST"
                        action="?/delete"
                        use:enhance={() => {
                          const deletedLabel = attr.label;
                          return async ({ result, update }) => {
                            await update(); 
                            if (result.type === "success") {
                              successMessage = `Attribut erfolgreich gelöscht!`;
                              setTimeout(() => { successMessage = ""; }, 3500);
                            }
                          };
                        }}
                        class="m-0 p-0"
                      >
                        <input type="hidden" name="id" value={attr._id} />
                        <button
                          type="submit"
                          class="btn btn-sm btn-outline-danger btn-light-danger fw-bold px-3 shadow-sm"
                          onclick={(e) => {
                            if (!confirm(`Möchtest du das Attribut '${attr.label}' wirklich unwiderruflich löschen?`)) {
                              e.preventDefault();
                            }
                          }}
                        >
                          <i class="bi bi-trash me-1"></i> Löschen
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Globale Font & Farben für das Light Theme */
  .space-grotesk { font-family: "Space Grotesk", sans-serif; color: #334155; }
  h2, h3 { color: #22c55e; font-weight: 700; }
  .text-title-dark { color: #1e293b; }
  .text-muted-custom { color: #64748b; }
  
  /* Helle Karten */
  .light-card { background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
  .light-card-header { background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; border-radius: 8px 8px 0 0; }
  
  /* Inputs */
  .light-input { 
    background-color: #ffffff !important; 
    border: 1px solid #cbd5e1 !important; 
    color: #334155 !important; 
    border-radius: 6px;
    box-shadow: none !important;
    transition: all 0.2s;
  }
  .light-input:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1) !important; outline: none; }
  .light-input-group-text { background-color: #f8fafc !important; border: 1px solid #cbd5e1 !important; border-right: none !important; color: #64748b !important; }
  
  /* Checkboxen */
  .light-checkbox { border: 1px solid #cbd5e1; cursor: pointer; }
  .light-checkbox:checked { background-color: #3b82f6; border-color: #3b82f6; }
  
  /* Buttons */
  .btn-primary { background-color: #3b82f6; border-color: #3b82f6; color: white; transition: all 0.2s; }
  .btn-primary:hover { background-color: #2563eb; border-color: #2563eb; }
  .btn-success { background-color: #22c55e; border-color: #22c55e; color: white; transition: all 0.2s; }
  .btn-success:hover { background-color: #16a34a; border-color: #16a34a; }
  .btn-light-outline { color: #334155; border-color: #cbd5e1; background: #ffffff; transition: all 0.2s; }
  .btn-light-outline:hover { background: #f1f5f9; color: #1e293b; border-color: #94a3b8; }
  .btn-light-danger { color: #ef4444; border-color: #fca5a5; background: transparent; transition: all 0.2s; }
  .btn-light-danger:hover { background: #fee2e2; color: #b91c1c; border-color: #f87171; }

  /* Listen-Gruppen */
  .light-list-group { border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
  .light-list-item { border-left: none; border-right: none; border-top: none; border-bottom: 1px solid #e2e8f0 !important; background: #ffffff; transition: background 0.2s; }
  .light-list-item:last-child { border-bottom: none !important; }
  .light-list-item button:hover { background-color: #f8fafc !important; }
  .light-expanded-area { background-color: #f8fafc; border-top: 1px solid #e2e8f0 !important; }
  
  /* Badges */
  .light-badge { background-color: #ffffff; border: 1px solid #cbd5e1; color: #334155; font-weight: 500; }
  .light-badge-primary { background-color: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; font-weight: 500; }

  /* Inner-Box (für Formulare) */
  .inner-box { background-color: #f8fafc; border: 1px solid #e2e8f0; }
  .light-options-container { background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; min-height: 100px; max-height: 300px; overflow-y: auto; }

  /* Banners */
  .info-banner { background-color: #eff6ff; border: 1px solid #bfdbfe; }
  .success-banner { background-color: #dcfce7; border: 1px solid #bbf7d0; color: #166534; }

  /* Scrollbar für die Sidebar */
  .light-scrollbar::-webkit-scrollbar { width: 6px; }
  .light-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .light-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; }
  .light-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #94a3b8; }

  /* Animationen */
  .animate-fade-in { animation: fadeIn 0.3s ease-out; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
</style>