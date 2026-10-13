<script>
    import { imageUrl } from '$lib/imageUrl.js';
    export let data;

    // Mengen sind anpassbar; Summen rechnen sich mit
    let groups = data.groups.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i })) }));
    $: totals = groups.map((g) => g.items.reduce((sum, i) => sum + (i.price !== null ? i.price * (Number(i.quantity) || 0) : 0), 0));
    $: grandTotal = totals.reduce((a, b) => a + b, 0);
    $: itemCount = groups.reduce((n, g) => n + g.items.length, 0);

    const chf = (v) => (v === null || v === undefined ? '–' : `CHF ${v.toFixed(2)}`);
    const today = new Date().toLocaleDateString('de-CH');
    const fileBase = () => `Nachbestellung_${data.systemName.replace(/[^\w-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}`;

    function download(blob, name) {
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: name });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // CSV mit Semikolon und BOM, damit Excel (CH/DE) Umlaute und Spalten korrekt erkennt
    function exportCsv() {
        const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const rows = [['Lieferant', 'Artikel', 'GTIN/Art.-Nr.', 'Bestand', 'Mindestbestand', 'Soll-Bestand', 'Bestellmenge', 'Preis/Stk. (CHF)', 'Summe (CHF)', 'Bestelllink']];
        for (const g of groups) for (const i of g.items) {
            const total = i.price !== null ? (i.price * (Number(i.quantity) || 0)).toFixed(2) : '';
            rows.push([g.supplier, i.title, i.gtin, i.stock, i.min ?? '', i.target ?? '', i.quantity, i.price !== null ? i.price.toFixed(2) : '', total, i.orderLink]);
        }
        const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
        download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${fileBase()}.csv`);
    }

    async function exportPdf() {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF();
        let y = 18;
        const line = (text, x, opts = {}) => doc.text(String(text), x, y, opts);
        const newPageIfNeeded = () => { if (y > 275) { doc.addPage(); y = 18; } };

        doc.setFontSize(16); line(`Nachbestellung – ${data.systemName}`, 14);
        doc.setFontSize(10); y += 6; line(`Stand: ${today} · ${itemCount} Artikel · Gesamt ${chf(grandTotal)}`, 14);
        y += 10;

        groups.forEach((g, gi) => {
            newPageIfNeeded();
            doc.setFontSize(12); doc.setFont(undefined, 'bold'); line(g.supplier, 14);
            doc.setFont(undefined, 'normal'); doc.setFontSize(9); y += 6;
            line('Artikel', 14); line('Bestand', 120); line('Menge', 140); line('Summe', 196, { align: 'right' });
            y += 2; doc.line(14, y, 196, y); y += 5;
            for (const i of g.items) {
                newPageIfNeeded();
                const title = doc.splitTextToSize(i.title + (i.gtin ? ` (${i.gtin})` : ''), 100);
                doc.text(title, 14, y);
                line(i.stock, 120); line(i.quantity, 140);
                line(i.price !== null ? (i.price * (Number(i.quantity) || 0)).toFixed(2) : '–', 196, { align: 'right' });
                y += 5 * title.length + 1;
            }
            doc.setFont(undefined, 'bold'); line(`Summe ${g.supplier}: ${chf(totals[gi])}`, 196, { align: 'right' });
            doc.setFont(undefined, 'normal'); y += 10;
        });
        doc.save(`${fileBase()}.pdf`);
    }
</script>

<svelte:head><title>Nachbestellen | Sortify</title></svelte:head>

<div class="page-container space-grotesk">
    <div class="header">
        <div>
            <h1>Nachbestellen</h1>
            <p class="subtitle">Artikel am oder unter dem Mindestbestand – Mengen bis zum Soll-Bestand vorgeschlagen.</p>
        </div>
        {#if itemCount > 0}
            <div class="actions">
                <button type="button" class="btn-secondary" on:click={exportCsv}><i class="bi bi-filetype-csv"></i> CSV</button>
                <button type="button" class="btn-primary" on:click={exportPdf}><i class="bi bi-file-earmark-pdf"></i> PDF</button>
            </div>
        {/if}
    </div>

    {#if itemCount === 0}
        <div class="empty-card">
            <div class="empty-icon">✅</div>
            <h2>Alles im grünen Bereich</h2>
            <p>Kein Artikel liegt am oder unter seinem Mindestbestand.</p>
        </div>
    {:else}
        <div class="summary">{itemCount} Artikel · voraussichtlich <strong>{chf(grandTotal)}</strong></div>

        {#each groups as group, gi (group.supplier)}
            <section class="supplier-card">
                <div class="supplier-head">
                    <h2>{group.supplier}</h2>
                    <span class="supplier-total">{chf(totals[gi])}</span>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr><th></th><th>Artikel</th><th class="num">Bestand</th><th class="num">Min. / Soll</th><th class="num">Menge</th><th class="num">Preis</th><th class="num">Summe</th><th></th></tr>
                        </thead>
                        <tbody>
                            {#each group.items as item (item.id)}
                                <tr class:empty={item.stock === 0}>
                                    <td class="thumb">{#if item.imagePath}<img src={imageUrl(item.imagePath, 120)} alt="" loading="lazy" />{/if}</td>
                                    <td><a href="/{item.id}" class="title">{item.title}</a>{#if item.gtin}<div class="gtin">{item.gtin}</div>{/if}</td>
                                    <td class="num">{item.stock}</td>
                                    <td class="num">{item.min ?? '–'} / {item.target ?? '–'}</td>
                                    <td class="num"><input type="number" min="1" bind:value={item.quantity} aria-label="Bestellmenge {item.title}" /></td>
                                    <td class="num">{chf(item.price)}</td>
                                    <td class="num">{item.price !== null ? chf(item.price * (Number(item.quantity) || 0)) : '–'}</td>
                                    <td>{#if item.orderLink}<a href={item.orderLink} target="_blank" rel="noopener noreferrer" class="btn-order">Bestellen ↗</a>{/if}</td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </section>
        {/each}
    {/if}
</div>

<style>
    .page-container { max-width: 1200px; margin: 0 auto; padding: 2rem 1rem; color: #334155; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
    h1 { margin: 0; color: #22c55e; }
    .subtitle { margin: 0.4rem 0 0 0; color: #94a3b8; }
    .actions { display: flex; gap: 0.6rem; }
    .btn-primary, .btn-secondary { border: none; border-radius: 6px; padding: 0.6rem 1.1rem; font-weight: 600; cursor: pointer; display: inline-flex; gap: 0.4rem; align-items: center; font-family: inherit; }
    .btn-primary { background: #3b82f6; color: #fff; }
    .btn-primary:hover { background: #2563eb; }
    .btn-secondary { background: #fff; color: #334155; border: 1px solid #cbd5e1; }
    .btn-secondary:hover { background: #f1f5f9; }
    .summary { color: #cbd5e1; margin-bottom: 1rem; }
    .summary strong { color: #fff; }

    .supplier-card, .empty-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.25rem; margin-bottom: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .supplier-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
    .supplier-head h2 { margin: 0; font-size: 1.15rem; color: #1e293b; }
    .supplier-total { font-weight: 700; color: #0284c7; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
    th { text-align: left; color: #64748b; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; padding: 0.5rem; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
    td { padding: 0.55rem 0.5rem; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .num { text-align: right; white-space: nowrap; }
    tr.empty td:nth-child(3) { color: #dc2626; font-weight: 700; }
    .thumb { width: 52px; }
    .thumb img { width: 48px; height: 36px; object-fit: contain; }
    .title { color: #1e293b; font-weight: 600; text-decoration: none; }
    .title:hover { color: #2563eb; }
    .gtin { font-size: 0.78rem; color: #94a3b8; font-family: monospace; }
    input[type="number"] { width: 5rem; padding: 0.3rem 0.4rem; border: 1px solid #cbd5e1; border-radius: 6px; text-align: right; font-family: inherit; }
    .btn-order { font-size: 0.82rem; color: #2563eb; text-decoration: none; white-space: nowrap; font-weight: 600; }
    .empty-card { text-align: center; padding: 3rem 1rem; }
    .empty-icon { font-size: 3rem; }
    .empty-card h2 { color: #1e293b; margin: 0.5rem 0; }
    .empty-card p { color: #64748b; }
</style>
