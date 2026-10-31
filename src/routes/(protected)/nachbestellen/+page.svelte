<script>
    import { onMount } from 'svelte';
    import { enhance } from '$app/forms';
    import { imageUrl } from '$lib/imageUrl.js';
    import { deliveryState, formatDate, todayString } from '$lib/orders.js';
    export let data;
    export let form;

    // Mengen sind anpassbar; Summen rechnen sich mit. Nach jeder Aktion neu aus den Daten übernehmen.
    $: groups = data.groups.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i })) }));
    $: totals = groups.map((g) => g.items.reduce((sum, i) => sum + (i.price !== null ? i.price * (Number(i.quantity) || 0) : 0), 0));
    $: grandTotal = totals.reduce((a, b) => a + b, 0);
    $: itemCount = groups.reduce((n, g) => n + g.items.length, 0);

    // Bestellt – unterwegs: nach Lieferant gruppiert, früheste Lieferung zuerst
    $: openGroups = Object.values(data.openOrders.reduce((acc, o) => {
        (acc[o.supplier] ||= { supplier: o.supplier, orders: [] }).orders.push(o);
        return acc;
    }, {}));

    // "Heute" erst im Browser bestimmen (Zeitzone des Geräts, nicht die des Servers)
    let todayIso = '';
    onMount(() => (todayIso = todayString()));

    let busy = false;
    const submitting = () => {
        busy = true;
        return async ({ update }) => {
            await update({ reset: false });
            busy = false;
        };
    };
    const confirmCancel = (event, order) => {
        if (!confirm(`Bestellung „${order.title}“ (${order.remaining} Stk. offen) wirklich stornieren?`)) event.preventDefault();
    };

    const chf = (v) => (v === null || v === undefined ? '–' : `CHF ${v.toFixed(2)}`);
    const qty = (n) => Number(n).toLocaleString('de-CH');
    const day = (iso) => new Date(iso).toLocaleDateString('de-CH');
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
            <p class="subtitle">Artikel am oder unter dem Mindestbestand – Mengen bis zum Soll-Bestand vorgeschlagen. Bereits bestellte Mengen sind berücksichtigt.</p>
            {#if data.openOrders.length > 0}
                <nav class="jump">
                    <a href="#zu-bestellen">Zu bestellen ({itemCount})</a>
                    <a href="#unterwegs">Unterwegs ({data.openOrders.length})</a>
                </nav>
            {/if}
        </div>
        {#if itemCount > 0}
            <div class="actions">
                <button type="button" class="btn-secondary" on:click={exportCsv}><i class="bi bi-filetype-csv"></i> CSV</button>
                <button type="button" class="btn-primary" on:click={exportPdf}><i class="bi bi-file-earmark-pdf"></i> PDF</button>
            </div>
        {/if}
    </div>

    {#if form?.ordered}
        <div class="notice success" role="status">✅ {form.ordered === 1 ? '1 Artikel' : `${form.ordered} Artikel`} als bestellt markiert – siehe „Unterwegs“.</div>
    {:else if form?.received}
        <div class="notice success" role="status">
            ✅ {qty(form.received.quantity)} × {form.received.title} {form.received.barcode ? `in Fach ${form.received.barcode}` : ''} eingelagert.
            {form.received.done ? 'Bestellung abgeschlossen.' : `Noch ${qty(form.received.remaining)} Stk. offen.`}
        </div>
    {:else if form?.cancelled}
        <div class="notice" role="status">Bestellung storniert.</div>
    {:else if form?.orderError || (form?.receiveError && !form?.orderId)}
        <div class="notice error" role="alert">{form.orderError || form.receiveError}</div>
    {/if}

    {#if itemCount === 0 && data.openOrders.length === 0}
        <div class="empty-card">
            <div class="empty-icon">✅</div>
            <h2>Alles im grünen Bereich</h2>
            <p>Kein Artikel liegt am oder unter seinem Mindestbestand.</p>
        </div>
    {:else if itemCount === 0}
        <div class="empty-card small" id="zu-bestellen">
            <h2>Nichts zu bestellen</h2>
            <p>Alle knappen Artikel sind bereits bestellt.</p>
        </div>
    {:else}
        <div class="summary" id="zu-bestellen">{itemCount} Artikel · voraussichtlich <strong>{chf(grandTotal)}</strong></div>

        {#each groups as group, gi (group.supplier)}
            <form class="supplier-card" method="POST" action="?/order" use:enhance={submitting}>
                <div class="supplier-head">
                    <h2>{group.supplier}</h2>
                    <label class="date-field">Liefertermin <input type="date" name="expectedDate" /></label>
                    <span class="supplier-total">{chf(totals[gi])}</span>
                </div>
                <div class="table-wrap">
                    <table class="reorder-table">
                        <thead>
                            <tr><th></th><th>Artikel</th><th class="num">Bestand</th><th class="num">Min. / Soll</th><th class="num">Menge</th><th class="num">Preis</th><th class="num">Summe</th><th></th></tr>
                        </thead>
                        <tbody>
                            {#each group.items as item (item.id)}
                                <tr class:empty={item.stock === 0}>
                                    <td class="thumb">{#if item.imagePath}<img src={imageUrl(item.imagePath, 120)} alt="" loading="lazy" />{/if}</td>
                                    <td class="cell-title"><a href="/{item.id}" class="title">{item.title}</a>{#if item.gtin}<div class="gtin">{item.gtin}</div>{/if}</td>
                                    <td class="num cell-stock" data-label="Bestand">{item.stock}{#if item.onOrder}<div class="on-order">+{qty(item.onOrder)} bestellt</div>{/if}</td>
                                    <td class="num cell-minmax" data-label="Min. / Soll">{item.min ?? '–'} / {item.target ?? '–'}</td>
                                    <td class="num cell-qty"><input type="number" min="1" step="1" required name="qty:{item.id}" bind:value={item.quantity} aria-label="Bestellmenge {item.title}" /></td>
                                    <td class="num cell-price">{chf(item.price)}</td>
                                    <td class="num cell-total" data-label="Summe">{item.price !== null ? chf(item.price * (Number(item.quantity) || 0)) : '–'}</td>
                                    <td class="row-actions">
                                        {#if item.orderLink}<a href={item.orderLink} target="_blank" rel="noopener noreferrer" class="btn-order">Shop ↗</a>{/if}
                                        <button type="submit" name="articleId" value={item.id} class="btn-mark" disabled={busy}>✓ Bestellt</button>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
                {#if group.items.length > 1}
                    <div class="order-bar">
                        <button type="submit" name="articleId" value="all" class="btn-primary" disabled={busy}>Alle {group.items.length} als bestellt markieren</button>
                    </div>
                {/if}
            </form>
        {/each}
    {/if}

    {#if data.openOrders.length > 0}
        <h2 class="section-title" id="unterwegs">Bestellt – unterwegs</h2>
        <p class="section-hint">Sobald die Ware da ist: Menge prüfen und „Eingelagert“ drücken. Der Bestand wird automatisch erhöht.</p>

        {#each openGroups as group (group.supplier)}
            <section class="supplier-card">
                <div class="supplier-head"><h2>{group.supplier}</h2><span class="muted">{group.orders.length} {group.orders.length === 1 ? 'Position' : 'Positionen'}</span></div>
                {#each group.orders as order (order.id)}
                    {@const state = todayIso ? deliveryState(order.expectedDate, todayIso) : 'none'}
                    <div class="order-row" class:overdue={state === 'overdue'}>
                        <div class="thumb">{#if order.imagePath}<img src={imageUrl(order.imagePath, 120)} alt="" loading="lazy" />{/if}</div>
                        <div class="order-info">
                            {#if order.articleExists}<a href="/{order.articleId}" class="title">{order.title}</a>{:else}<span class="title">{order.title}</span> <span class="badge gray">Artikel gelöscht</span>{/if}
                            <div class="meta">
                                {qty(order.quantity)} Stk. bestellt am {day(order.orderedAt)}{order.orderedBy ? ` · ${order.orderedBy}` : ''}
                                {#if order.received > 0}<span class="badge blue">{qty(order.received)} geliefert, {qty(order.remaining)} offen</span>{/if}
                            </div>
                            <form class="date-form" method="POST" action="?/reschedule" use:enhance={submitting}>
                                <input type="hidden" name="orderId" value={order.id} />
                                <label>Liefertermin <input type="date" name="expectedDate" value={order.expectedDate || ''} on:change={(e) => e.currentTarget.form.requestSubmit()} disabled={busy} /></label>
                                {#if state === 'overdue'}<span class="badge red">überfällig</span>{:else if state === 'today'}<span class="badge green">heute</span>{:else if !order.expectedDate}<span class="muted">kein Termin</span>{/if}
                            </form>
                        </div>
                        <form class="receive-form" method="POST" action="?/receive" use:enhance={submitting}>
                            <input type="hidden" name="orderId" value={order.id} />
                            {#if order.articleExists}
                                <label class="qty-field">Menge <input type="number" name="quantity" min="1" step="1" required value={order.remaining} /></label>
                                {#if order.drawers.length > 1}
                                    <select name="barcode" aria-label="Fach für {order.title}">
                                        <option value="">Fach wählen…</option>
                                        {#each order.drawers as d (d.barcode)}<option value={d.barcode}>Fach {d.barcode} (Bestand {qty(d.stock)})</option>{/each}
                                    </select>
                                {:else if order.drawers.length === 1}
                                    <span class="target">→ Fach {order.drawers[0].barcode}</span>
                                {:else}
                                    <span class="target">→ Bestand (ohne Fach)</span>
                                {/if}
                                <button type="submit" class="btn-receive" disabled={busy}>✓ Eingelagert</button>
                            {/if}
                            <button type="submit" formaction="?/cancel" formnovalidate class="btn-cancel" disabled={busy} on:click={(e) => confirmCancel(e, order)}>Stornieren</button>
                        </form>
                        {#if form?.receiveError && form?.orderId === order.id}<div class="row-error" role="alert">{form.receiveError}</div>{/if}
                    </div>
                {/each}
            </section>
        {/each}
    {/if}

    {#if data.recentOrders.length > 0}
        <details class="history">
            <summary>Verlauf ({data.recentOrders.length} zuletzt abgeschlossen)</summary>
            <ul>
                {#each data.recentOrders as o (o.id)}
                    <li>
                        <span class="muted">{day(o.closedAt)}</span>
                        <span class="title">{o.title}</span>
                        {#if o.status === 'received'}
                            <span class="badge green">{qty(o.received)} Stk. eingelagert</span>
                        {:else if o.received > 0}
                            <span class="badge blue">{qty(o.received)} von {qty(o.quantity)} eingelagert, Rest storniert</span>
                        {:else}
                            <span class="badge gray">{qty(o.quantity)} Stk. storniert{o.cancelReason ? ` (${o.cancelReason})` : ''}</span>
                        {/if}
                    </li>
                {/each}
            </ul>
        </details>
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
    .supplier-head { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem 1rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
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
    .row-actions { white-space: nowrap; text-align: right; }
    .row-actions .btn-order { margin-right: 0.6rem; }
    .btn-mark { background: #f0fdf4; color: #15803d; border: 1px solid #86efac; border-radius: 6px; padding: 0.3rem 0.65rem; font-weight: 700; font-size: 0.82rem; cursor: pointer; font-family: inherit; white-space: nowrap; }
    .btn-mark:hover:not(:disabled) { background: #dcfce7; }
    button:disabled { opacity: 0.6; cursor: wait; }
    .on-order { font-size: 0.75rem; color: #2563eb; font-weight: 600; }
    .date-field { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; color: #64748b; font-weight: 600; margin-left: auto; }
    input[type="date"] { padding: 0.3rem 0.4rem; border: 1px solid #cbd5e1; border-radius: 6px; font-family: inherit; color: #1e293b; background: #fff; }
    .order-bar { display: flex; justify-content: flex-end; margin-top: 0.85rem; }
    .jump { display: flex; gap: 0.5rem; margin-top: 0.6rem; flex-wrap: wrap; }
    .jump a { font-size: 0.85rem; font-weight: 600; color: #e2e8f0; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 999px; padding: 0.25rem 0.75rem; text-decoration: none; }
    .jump a:hover { background: rgba(255,255,255,0.16); }
    .notice { border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-weight: 600; background: #f1f5f9; color: #334155; }
    .notice.success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
    .notice.error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }

    .section-title { color: #f8fafc; font-size: 1.3rem; margin: 2rem 0 0.25rem 0; scroll-margin-top: 80px; }
    .section-hint { color: #94a3b8; margin: 0 0 1rem 0; font-size: 0.9rem; }
    #zu-bestellen { scroll-margin-top: 80px; }
    .muted { color: #94a3b8; font-size: 0.85rem; }
    .order-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem 1rem; padding: 0.75rem 0; border-top: 1px solid #f1f5f9; }
    .supplier-head + .order-row { border-top: none; }
    .order-row.overdue { background: #fff7f7; margin: 0 -1.25rem; padding-left: 1.25rem; padding-right: 1.25rem; }
    .order-row .thumb { flex: none; }
    .order-info { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 0.25rem; }
    .meta { font-size: 0.85rem; color: #64748b; display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; }
    .date-form { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .date-form label { font-size: 0.82rem; color: #64748b; font-weight: 600; display: inline-flex; gap: 0.4rem; align-items: center; }
    .receive-form { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-left: auto; }
    .qty-field { font-size: 0.82rem; color: #64748b; font-weight: 600; display: inline-flex; gap: 0.4rem; align-items: center; }
    .receive-form select { padding: 0.35rem 0.4rem; border: 1px solid #cbd5e1; border-radius: 6px; font-family: inherit; max-width: 14rem; }
    .target { font-size: 0.85rem; color: #334155; font-weight: 600; white-space: nowrap; }
    .btn-receive { background: #22c55e; color: #052e16; border: none; border-radius: 6px; padding: 0.45rem 0.9rem; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap; }
    .btn-receive:hover:not(:disabled) { background: #16a34a; color: #fff; }
    .btn-cancel { background: none; border: none; color: #94a3b8; font-weight: 600; cursor: pointer; font-family: inherit; font-size: 0.82rem; padding: 0.3rem; }
    .btn-cancel:hover:not(:disabled) { color: #dc2626; }
    .row-error { flex-basis: 100%; color: #b91c1c; font-weight: 600; font-size: 0.85rem; }
    .badge { font-size: 0.75rem; font-weight: 700; border-radius: 999px; padding: 0.1rem 0.55rem; white-space: nowrap; }
    .badge.red { background: #fee2e2; color: #b91c1c; }
    .badge.green { background: #dcfce7; color: #15803d; }
    .badge.blue { background: #dbeafe; color: #1d4ed8; }
    .badge.gray { background: #f1f5f9; color: #64748b; }

    .history { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.9rem 1.25rem; margin-top: 1.5rem; }
    .history summary { cursor: pointer; font-weight: 700; color: #1e293b; }
    .history ul { list-style: none; padding: 0; margin: 0.75rem 0 0 0; display: flex; flex-direction: column; gap: 0.45rem; }
    .history li { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; font-size: 0.9rem; }
    .history .title { color: #1e293b; }
    /* Handy: Zeilen als kompakte Karten, damit Menge und „Bestellt“ ohne seitliches Scrollen erreichbar sind */
    @media (max-width: 700px) {
        .supplier-head .date-field { order: 3; flex-basis: 100%; margin-left: 0; }
        .supplier-head .date-field input { flex: 1; }
        .reorder-table thead { display: none; }
        .reorder-table, .reorder-table tbody { display: block; }
        .reorder-table tr {
            display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.45rem 0.75rem; padding: 0.75rem 0; border-bottom: 1px solid #f1f5f9;
            grid-template-areas: "title title title" "stock minmax total" "qty actions actions";
        }
        .reorder-table td { border: none; padding: 0; text-align: left; }
        .reorder-table td.thumb, .reorder-table td.cell-price { display: none; }
        .reorder-table td[data-label]::before { content: attr(data-label); display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.03em; color: #94a3b8; font-weight: 600; }
        .cell-title { grid-area: title; }
        .cell-stock { grid-area: stock; }
        .cell-minmax { grid-area: minmax; }
        .cell-total { grid-area: total; }
        .cell-qty { grid-area: qty; align-self: center; }
        .row-actions { grid-area: actions; align-self: center; }
        .order-bar .btn-primary { width: 100%; justify-content: center; }
    }

    .empty-card { text-align: center; padding: 3rem 1rem; }
    .empty-card.small { padding: 1.5rem 1rem; }
    .empty-card.small h2 { font-size: 1.1rem; }
    .empty-icon { font-size: 3rem; }
    .empty-card h2 { color: #1e293b; margin: 0.5rem 0; }
    .empty-card p { color: #64748b; }
</style>
