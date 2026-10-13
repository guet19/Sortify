<script>
    import { enhance } from '$app/forms';
    import { parseCsvObjects, toCsv } from '$lib/csv.js';
    import { validateImportRows, CSV_COLUMNS } from '$lib/articleCsv.js';
    export let data;
    export let form;

    let fileName = '';
    let rawRows = [];
    let createCategories = false;
    let isImporting = false;

    // Vorschau: dieselben Regeln wie auf dem Server
    $: checked = validateImportRows(rawRows, data.categories, { allowNewCategories: createCategories && data.canManageCategories, existingGtins: data.existingGtins });
    $: importable = checked.filter((r) => r.errors.length === 0 && !r.skipped);
    $: invalid = checked.filter((r) => r.errors.length > 0);
    $: skipped = checked.filter((r) => r.skipped);
    $: newCategoryCount = new Set(importable.filter((r) => r.newCategory).map((r) => `${r.data.mainCategoryName}›${r.data.subcategoryName}`.toLowerCase())).size;

    async function handleFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        fileName = file.name;
        rawRows = parseCsvObjects(await file.text());
        if (rawRows.length > data.maxRows) rawRows = rawRows.slice(0, data.maxRows);
    }

    function downloadTemplate() {
        const csv = toCsv([CSV_COLUMNS.map((c) => c.key), ['Spanplattenschraube 4 x 40 mm', 'Schrauben', 'Holzschrauben', '120', '200', '50', 'Würth AG', '7611234567890', '0,12', 'https://…', 'Torx, verzinkt']]);
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: 'Sortify_Import_Vorlage.csv' });
        document.body.appendChild(a); a.click(); a.remove();
    }
</script>

<svelte:head><title>CSV-Import | Sortify</title></svelte:head>

<div class="page-container space-grotesk">
    <div class="header">
        <div>
            <h1>Artikel aus CSV importieren</h1>
            <p class="subtitle">Pflichtspalten: {CSV_COLUMNS.filter((c) => c.required).map((c) => c.key).join(', ')}. Weitere: {CSV_COLUMNS.filter((c) => !c.required).map((c) => c.key).join(', ')}.</p>
        </div>
        <button type="button" class="btn-secondary" on:click={downloadTemplate}><i class="bi bi-download"></i> Vorlage herunterladen</button>
    </div>

    {#if form?.imported !== undefined}
        <div class="alert success">
            ✅ {form.imported} Artikel importiert{form.skipped ? `, ${form.skipped} übersprungen (GTIN vorhanden)` : ''}{form.invalid ? `, ${form.invalid} fehlerhaft` : ''}.
            {#if form.failed?.length}Fehler beim Speichern in Zeile {form.failed.join(', ')}.{/if}
            <a href="/">Zur Artikelübersicht →</a>
        </div>
    {:else if form?.error}
        <div class="alert error">{form.error}</div>
    {/if}

    <div class="card">
        <label class="file-drop">
            <input type="file" accept=".csv,text/csv" on:change={handleFile} />
            <span><i class="bi bi-filetype-csv"></i> {fileName || 'CSV-Datei auswählen (Semikolon oder Komma, z.B. aus Excel)'}</span>
        </label>

        {#if rawRows.length > 0}
            <div class="summary">
                <span class="ok">{importable.length} bereit</span>
                {#if skipped.length}<span class="skip">{skipped.length} übersprungen</span>{/if}
                {#if invalid.length}<span class="bad">{invalid.length} fehlerhaft</span>{/if}
            </div>

            {#if data.canManageCategories}
                <label class="check">
                    <input type="checkbox" bind:checked={createCategories} />
                    Unbekannte Kategorien automatisch anlegen
                    {#if createCategories && newCategoryCount}<em>({newCategoryCount} neu)</em>{/if}
                </label>
            {/if}

            <div class="table-wrap">
                <table>
                    <thead><tr><th>Zeile</th><th>Titel</th><th>Kategorie</th><th class="num">Bestand</th><th>Status</th></tr></thead>
                    <tbody>
                        {#each checked as row (row.line)}
                            <tr class:row-bad={row.errors.length} class:row-skip={row.skipped && !row.errors.length}>
                                <td>{row.line}</td>
                                <td>{row.data.title || '–'}</td>
                                <td>{row.data.mainCategoryName} › {row.data.subcategoryName}{#if row.newCategory && !row.errors.length} <span class="tag">neu</span>{/if}</td>
                                <td class="num">{row.data.istBestand ?? '–'}</td>
                                <td>{#if row.errors.length}{row.errors.join(' · ')}{:else if row.skipped}{row.skipped}{:else}✓{/if}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            <form method="POST" action="?/import" use:enhance={() => {
                isImporting = true;
                return async ({ update }) => { await update(); isImporting = false; rawRows = []; fileName = ''; };
            }}>
                <input type="hidden" name="rows" value={JSON.stringify(rawRows)} />
                <input type="hidden" name="createCategories" value={String(createCategories)} />
                <button type="submit" class="btn-primary" disabled={importable.length === 0 || isImporting}>
                    {isImporting ? 'Wird importiert…' : `${importable.length} Artikel importieren`}
                </button>
            </form>
        {/if}
    </div>
</div>

<style>
    .page-container { max-width: 1100px; margin: 0 auto; padding: 2rem 1rem; color: #334155; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
    h1 { margin: 0; color: #22c55e; }
    .subtitle { margin: 0.4rem 0 0 0; color: #94a3b8; max-width: 700px; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
    .file-drop { border: 2px dashed #cbd5e1; border-radius: 8px; padding: 1.5rem; text-align: center; cursor: pointer; color: #475569; font-weight: 600; }
    .file-drop:hover { border-color: #3b82f6; background: #eff6ff; }
    .file-drop input { display: none; }
    .summary { display: flex; gap: 0.6rem; flex-wrap: wrap; }
    .summary span { padding: 0.25rem 0.7rem; border-radius: 999px; font-weight: 700; font-size: 0.85rem; }
    .ok { background: #dcfce7; color: #166534; } .skip { background: #fef3c7; color: #92400e; } .bad { background: #fee2e2; color: #b91c1c; }
    .check { display: flex; align-items: center; gap: 0.5rem; font-size: 0.92rem; }
    .table-wrap { overflow: auto; max-height: 420px; border: 1px solid #e2e8f0; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
    th { position: sticky; top: 0; background: #f8fafc; text-align: left; padding: 0.5rem; color: #64748b; font-size: 0.75rem; text-transform: uppercase; }
    td { padding: 0.45rem 0.5rem; border-top: 1px solid #f1f5f9; }
    .num { text-align: right; }
    .row-bad td { background: #fef2f2; color: #991b1b; }
    .row-skip td { background: #fffbeb; color: #92400e; }
    .tag { background: #dbeafe; color: #1d4ed8; border-radius: 999px; padding: 0 0.4rem; font-size: 0.72rem; font-weight: 700; }
    .btn-primary, .btn-secondary { border: none; border-radius: 6px; padding: 0.65rem 1.2rem; font-weight: 600; cursor: pointer; font-family: inherit; display: inline-flex; align-items: center; gap: 0.4rem; }
    .btn-primary { background: #3b82f6; color: #fff; align-self: flex-start; }
    .btn-primary:disabled { background: #93c5fd; cursor: not-allowed; }
    .btn-secondary { background: #fff; color: #334155; border: 1px solid #cbd5e1; }
    .alert { padding: 0.9rem 1rem; border-radius: 8px; margin-bottom: 1rem; font-weight: 600; }
    .alert.success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
    .alert.success a { color: #15803d; margin-left: 0.5rem; }
    .alert.error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
</style>
