<script>
    import { page } from '$app/stores';

    // Läuft als Lesezeichen auf der Shop-Seite: sammelt Produktdaten und alle großen Produktbilder
    // und übergibt sie per postMessage an das geöffnete Sortify-Fenster (keine Längenbegrenzung wie bei URLs).
    // Wichtig: Die Funktion darf nichts von außerhalb verwenden, da sie als Text ins Lesezeichen kopiert wird.
    // mode: 'article' -> neuen Artikel anlegen, 'category' -> Kategorie-Struktur mit KI planen
    function sortifyImport(origin, mode) {
        var d = document;
        var clean = function (s, n) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n); };
        var meta = function (sel) { var m = d.querySelector(sel); return m ? m.content : ''; };
        var abs = function (u) { try { return new URL(u, location.href).href; } catch (e) { return ''; } };

        // 1. Strukturierte Produktdaten (JSON-LD), auch verschachtelt in @graph
        var products = [];
        d.querySelectorAll('script[type="application/ld+json"]').forEach(function (s) {
            try {
                (function walk(o) {
                    if (!o || typeof o !== 'object') return;
                    if (Array.isArray(o)) return o.forEach(walk);
                    var t = o['@type'];
                    if (t === 'Product' || (Array.isArray(t) && t.indexOf('Product') >= 0)) products.push(o);
                    if (o['@graph']) walk(o['@graph']);
                })(JSON.parse(s.textContent));
            } catch (e) {}
        });

        // 2. Bild-Kandidaten: Produktdaten, Vorschaubild und alle großen Bilder der Seite
        var images = [], seen = {};
        var add = function (u, alt) {
            if (!u) return;
            u = abs(u);
            if (!u || seen[u] || !/^https?:/.test(u) || /\.svg(\?|$)/i.test(u)) return;
            seen[u] = 1;
            images.push({ url: u, alt: clean(alt, 80) });
        };
        products.forEach(function (p) {
            [].concat(p.image || []).forEach(function (i) { add(typeof i === 'string' ? i : i && (i.url || i.contentUrl)); });
        });
        add(meta('meta[property="og:image"]'));
        add(meta('meta[name="twitter:image"]'));
        d.querySelectorAll('img').forEach(function (i) {
            var zoom = i.getAttribute('data-zoom-image') || i.getAttribute('data-large') || i.getAttribute('data-zoom') || i.getAttribute('data-src-large');
            if (zoom) add(zoom, i.alt);
            var w = i.naturalWidth || i.width, h = i.naturalHeight || i.height;
            if (w >= 250 && h >= 250) add(i.currentSrc || i.src, i.alt);
        });
        images = images.slice(0, 24);

        // 2b. Auf der Seite gewählte Variante (Grösse, Farbe, Menge …): Auswahllisten, Optionsknöpfe und
        //     als ausgewählt markierte Varianten-Kacheln – aber nur in Bereichen, die nach Varianten aussehen
        var picked = [], pickedSeen = {};
        var pick = function (s) {
            s = clean(s, 200);
            if (s && s.length <= 80 && !pickedSeen[s.toLowerCase()]) { pickedSeen[s.toLowerCase()] = 1; picked.push(s); }
        };
        var visible = function (el) { return el.getClientRects().length > 0; };
        var labelOf = function (el) { return el.labels && el.labels[0] ? clean(el.labels[0].innerText, 60).replace(/:$/, '') : ''; };
        var optionArea = /sku|variant|variation|swatch|option|attribut|property|size|colou?r|farbe|gr(ö|oe)(ss|ß)e|l(ä|ae)nge|menge|pack|ausf(ü|ue)hrung|modell|style|material/i;
        var selectedClass = /(^|[\s_-])(selected|active|checked|current|chosen)($|[\s_-])/i;
        // Liegt das Element in einem Varianten-Bereich (eigene Angaben oder bis zu 5 Ebenen darüber)?
        var inOptionArea = function (el, extra) {
            if (el.closest('nav, header, footer, [role="tablist"], [role="navigation"]')) return false;
            if (optionArea.test(extra || '')) return true;
            for (var a = el, i = 0; a && a !== d.body && i < 5; a = a.parentElement, i++) {
                var info = (a.getAttribute('class') || '') + ' ' + (a.id || '') + ' ' + (a.getAttribute('name') || '') + ' ' + (a.getAttribute('data-pl') || '');
                if (optionArea.test(info)) return true;
            }
            return false;
        };
        // Optionen wie "Versand ab: China" beschreiben den Versand, nicht den Artikel
        var shippingOption = function (el) {
            for (var a = el.parentElement, i = 0; a && a !== d.body && i < 4; a = a.parentElement, i++) {
                var first = a.firstElementChild;
                if (first && /^\s*(versand|ships?\b|shipping|lieferung|liefern aus|dispatch|abholung)/i.test(first.innerText || '')) return true;
            }
            return false;
        };
        d.querySelectorAll('select').forEach(function (s) {
            var o = s.options[s.selectedIndex];
            if (!o || !o.value || !visible(s) || /w(ä|ae)hle|choose|select|bitte|auswahl/i.test(o.text)) return;
            var l = labelOf(s) || s.getAttribute('aria-label') || '';
            if (!inOptionArea(s, l)) return;
            pick((l ? l + ': ' : '') + o.text);
        });
        d.querySelectorAll('input[type="radio"]:checked').forEach(function (r) {
            var group = r.closest('fieldset');
            var legend = group && group.querySelector('legend');
            var name = legend ? clean(legend.innerText, 40).replace(/:$/, '') : '';
            if (!inOptionArea(r, name + ' ' + (r.name || ''))) return;
            pick((name ? name + ': ' : '') + (labelOf(r) || r.value));
        });
        d.querySelectorAll('[aria-checked="true"], [aria-selected="true"], [aria-pressed="true"], [class*="selected"], [class*="active"], [class*="checked"], [class*="current"], [class*="chosen"]').forEach(function (el) {
            var cls = el.getAttribute('class') || '';
            var marked = /true/.test((el.getAttribute('aria-checked') || '') + (el.getAttribute('aria-selected') || '') + (el.getAttribute('aria-pressed') || '')) || selectedClass.test(cls);
            if (!marked || !visible(el) || !inOptionArea(el) || shippingOption(el)) return;
            var img = el.querySelector('img'), titled = el.querySelector('[title]');
            pick(el.getAttribute('title') || el.getAttribute('aria-label') || el.getAttribute('data-value') || (img && img.alt) || (titled && titled.getAttribute('title')) || el.innerText);
        });
        var variant = picked.slice(0, 6).join('; ').slice(0, 300);

        // 3. Texte: Datentabellen (technische Daten) und Hauptinhalt der Seite
        var tables = [];
        d.querySelectorAll('table, dl').forEach(function (t) {
            var x = clean(t.innerText, 6000);
            if (x.length > 20) tables.push(x);
        });
        var main = d.querySelector('main, [itemtype*="Product"], #content') || d.body;
        var description = clean(meta('meta[name="description"]') || meta('meta[property="og:description"]'), 500);
        var text = [
            'TITEL: ' + d.title,
            'URL: ' + location.href,
            'BESCHREIBUNG: ' + description,
            products.length ? 'PRODUKTDATEN (JSON-LD): ' + clean(JSON.stringify(products), 15000) : '',
            tables.length ? 'TABELLEN: ' + clean(tables.join(' || '), 8000) : '',
            'SEITENTEXT: ' + clean(main.innerText, 12000)
        ].join('\n');

        var payload = { type: 'sortify-import', version: 2, title: d.title, url: location.href, description: description, text: text, images: images, variant: variant };
        // Kurze Basisdaten zusätzlich in der URL (falls die Übergabe z.B. wegen Login nicht klappt)
        var target = mode === 'category'
            ? origin + '/einstellungen/category?ai_import=2&ai_title=' + encodeURIComponent(d.title) + '&ai_url=' + encodeURIComponent(location.href)
            : origin + '/addarticle?import=2&title=' + encodeURIComponent(d.title) + '&url=' + encodeURIComponent(location.href) + '&img=' + encodeURIComponent(images[0] ? images[0].url : '');
        var w = window.open(target, '_blank');
        if (!w) { alert('Bitte erlaube Pop-ups für diese Seite, damit Sortify geöffnet werden kann.'); return; }

        // Daten so lange senden, bis Sortify den Empfang bestätigt (max. 2 Minuten, z.B. falls erst ein Login nötig ist)
        var done = false, tries = 0;
        window.addEventListener('message', function (e) {
            if (e.origin === origin && e.data && e.data.type === 'sortify-import-ack') done = true;
        });
        var timer = setInterval(function () {
            if (done || ++tries > 240) return clearInterval(timer);
            try { w.postMessage(payload, origin); } catch (e) {}
        }, 500);
    }

    // URL-kodiert, damit Zeichen wie % im Lesezeichen nicht verfälscht werden
    const toBookmarklet = (mode) => 'javascript:' + encodeURIComponent(`(${sortifyImport.toString()})(${JSON.stringify($page.url.origin)}, ${JSON.stringify(mode)})`);
    $: bookmarkletCode = toBookmarklet('article');
    $: categoryBookmarkletCode = toBookmarklet('category');
    
    function handleClick(event) {
        event.preventDefault(); 
        alert('Bitte klicke nicht auf den Button, sondern ZIEHE ihn in deine Lesezeichenleiste oben im Browser!');
    }
</script>

<svelte:head>
    <title>Sortify Lesezeichen installieren</title>
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet">
</svelte:head>

<div class="page-wrapper">
    
    <div class="card center-content">
        <h1>Sortify KI-Importer</h1>
        <p class="instruction">
            Um Produkte von beliebigen Webseiten direkt in Sortify zu importieren, musst du nur den blauen Button unten <strong>mit gedrückter Maustaste nach oben in deine Lesezeichenleiste ziehen</strong>.
        </p>
        
        <a 
            class="bookmarklet-btn" 
            title="Sortify KI-Import" 
            href={bookmarkletCode} 
            on:click={handleClick}
        >
            ➕ Add to Sortify 
        </a>

        <p class="instruction" style="margin-top: 1.5rem;">
            Mit dem zweiten Lesezeichen plant die KI für ein Produkt die passende <strong>Haupt- und Unterkategorie samt Filtern</strong> – ideal, wenn eine neue Produktart ins Lager kommt.
        </p>

        <a 
            class="bookmarklet-btn bookmarklet-btn-secondary" 
            title="Sortify Kategorie planen" 
            href={categoryBookmarkletCode} 
            on:click={handleClick}
        >
            🗂️ Sortify Kategorie planen
        </a>

        <p class="gif-hint update-hint">
            <strong>Neue Version:</strong> Falls Sie die Lesezeichen schon früher installiert haben, löschen Sie diese bitte und ziehen Sie die Buttons erneut in die Leiste – erst dann werden mehrere Bilder und deutlich mehr Produktdaten übernommen.
        </p>

        <p class="gif-hint">
            (Tipp: Stelle sicher, dass deine Lesezeichenleiste eingeblendet ist. Bei den meisten Browsern geht das mit <strong>Strg + Umschalt + B</strong> oder <strong>Cmd + Shift + B</strong> auf dem Mac).
        </p>
    </div>

    <div class="card guide-content">
        <h2>So funktioniert der Sortify KI-Importer</h2>
        <p class="guide-intro">
            Das Hinzufügen von Artikeln per KI-Importer ist darauf ausgelegt, Ihnen möglichst viel manuelle Tipparbeit zu ersparen. Der Prozess läuft in fünf einfachen Schritten ab:
        </p>

        <div class="step">
            <h3>1. Datenübergabe per Lesezeichen</h3>
            <p>Sobald Sie auf einer beliebigen Webseite (z. B. in einem Online-Shop) auf den "Add to Sortify"-Button in Ihrer Lesezeichenleiste klicken, liest das System im Hintergrund die wichtigsten Rohdaten der Seite aus. Dazu gehören der Seitentitel, die Internetadresse (URL), der Beschreibungstext und mögliche Produktbilder. Diese Rohdaten werden sicher an Sortify übergeben und das Formular für einen neuen Artikel öffnet sich.</p>
        </div>

        <div class="step">
            <h3>2. Intelligente Kategorisierung (Ihre Aufgabe)</h3>
            <p>Bevor die KI loslegt, fragt Sortify Sie nach der passenden Haupt- und Unterkategorie für das Produkt.<br>
            <strong>Warum ist das wichtig?</strong> Jede Unterkategorie in Sortify hat spezifische Eigenschaften (z. B. benötigt eine Schraube Angaben zu Gewinde und Länge, ein Widerstand hingegen Ohm-Werte). Erst wenn die Kategorie feststeht, weiß die KI, nach welchen exakten technischen Daten sie im Text suchen muss.</p>
        </div>

        <div class="step">
            <h3>3. Die KI-Analyse (Automatisch)</h3>
            <p>Sobald Sie die Kategorien gewählt haben und den automatischen Import bestätigen, beginnt die eigentliche Arbeit der Künstlichen Intelligenz. Sortify sendet den ausgelesenen Text der Webseite zusammen mit den Anforderungen Ihrer gewählten Kategorie an unsere KI.</p>
            <p>Die KI durchsucht den unstrukturierten Text nun gezielt nach:</p>
            <ul>
                <li>Artikelbezeichnung und passender Beschreibung</li>
                <li>Preisen (inklusive automatischer Berechnung von Stückpreisen bei Packungen)</li>
                <li>Lieferant und Artikelnummern (GTIN/EAN)</li>
                <li>Allen spezifischen Eigenschaften der gewählten Kategorie (z. B. Maße, Material, Farbe)</li>
            </ul>
        </div>

        <div class="step">
            <h3>4. Bildverarbeitung (Automatisch)</h3>
            <p>Das Lesezeichen sammelt alle großen Produktbilder der Seite. Im Formular sehen Sie diese als Vorschau und können mit einem Klick das passende Bild wählen – die KI schlägt das beste Hauptproduktbild bereits vor. Jedes Bild wird automatisch auf eine weiße 4:3-Fläche gelegt (transparente Hintergründe werden weiß), sodass das ganze Produkt sichtbar ist. Den Ausschnitt können Sie danach noch anpassen.</p>
        </div>

        <div class="step">
            <h3>5. Menschliche Kontrolle & Speicherung</h3>
            <p>Künstliche Intelligenz ist mächtig, aber nicht unfehlbar. Sobald die KI alle Daten in die entsprechenden Formularfelder eingetragen hat, erhalten Sie einen kurzen Hinweis. Sie können nun alle ausgelesenen Werte in Ruhe überprüfen, fehlende Bestandsmengen (Ist-Bestand) ergänzen oder falsche Zuordnungen korrigieren. Mit einem Klick auf "Artikel in Datenbank speichern" wird das Produkt final gesichert.</p>
        </div>
    </div>

</div>

<style>
    /* Globales Body-Styling korrigiert: .body zu :global(body) geändert */
   

    .page-wrapper {
        padding: 60px 20px; 
        max-width: 800px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 30px; 
    }

    .card {
        background: #ffffff;
        padding: 40px;
        border-radius: 12px;
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 10px 15px -3px rgba(0,0,0,0.02);
        border: 1px solid #e2e8f0;
    }

    .center-content {
        text-align: center;
    }

    h1 { 
        color: #22c55e; 
        margin-top: 0; 
        font-size: 2rem;
    }

    h2 {
        color: #1e293b;
        margin-top: 0;
        font-size: 1.5rem;
        border-bottom: 2px solid #f1f5f9;
        padding-bottom: 10px;
        margin-bottom: 20px;
    }

    h3 {
        color: #3b82f6;
        font-size: 1.1rem;
        margin-bottom: 8px;
    }

    .instruction { 
        font-size: 1.1rem; 
        color: #64748b; 
        margin-bottom: 30px; 
    }
    
    .bookmarklet-btn {
        display: inline-block;
        background-color: #3b82f6;
        color: white;
        padding: 15px 30px;
        border-radius: 8px;
        text-decoration: none;
        font-weight: 700;
        font-size: 1.2rem;
        cursor: grab; 
        transition: background 0.2s;
        border: 2px dashed #2563eb; 
    }

    .bookmarklet-btn:hover { 
        background-color: #2563eb; 
    }

    .bookmarklet-btn:active { 
        cursor: grabbing; 
    }
    
    .bookmarklet-btn-secondary { background: #0f766e !important; margin-top: 0.5rem; }
    .update-hint { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 0.75rem 1rem; border-radius: 8px; }
    .gif-hint {
        margin-top: 30px;
        font-size: 0.9rem;
        color: #94a3b8;
    }

    .guide-content {
        text-align: left;
    }

    .guide-intro {
        font-size: 1.05rem;
        color: #475569;
        margin-bottom: 30px;
    }

    .step {
        margin-bottom: 25px;
    }

    .step p {
        color: #475569;
        margin: 0;
    }

    .step ul {
        margin-top: 10px;
        margin-bottom: 0;
        color: #475569;
        padding-left: 20px;
    }

    .step li {
        margin-bottom: 5px;
    }

    @media (max-width: 640px) {
        .card {
            padding: 25px 20px;
        }
        .page-wrapper {
            padding: 30px 15px;
        }
    }
</style>