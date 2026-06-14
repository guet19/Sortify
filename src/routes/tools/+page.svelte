<script>
    import { page } from '$app/stores';

    // DEIN NEUER CODE: Optimiert für die Erkennung von Beschreibungen, JSON-LD Produktdaten und Fließtext.
    // Durch Backticks (Template-Literals) bleibt der Code übersichtlich und nutzt dynamisch deine Domain.
    $: bookmarkletCode = `javascript:(function(){var title=document.title;var url=window.location.href;var imgMeta=document.querySelector('meta[property="og:image"]')||document.querySelector('meta[name="twitter:image"]');var imgUrl=imgMeta?imgMeta.content:'';if(!imgUrl){var firstImg=document.querySelector('img:not(header img, footer img, .icon img)');if(firstImg)imgUrl=firstImg.src;}var payload='';var descMeta=document.querySelector('meta[name="description"]')||document.querySelector('meta[property="og:description"]');if(descMeta)payload+='DESC: '+descMeta.content+' | ';var scripts=document.querySelectorAll('script[type="application/ld+json"]');scripts.forEach(function(s){if(s.innerText.includes('"Product"')){payload+='JSON: '+s.innerText+' | ';}});if(payload.length<200){payload+='TEXT: '+document.body.innerText;}payload=payload.replace(/\\s+/g,' ').trim().substring(0,1200);var target='${$page.url.origin}/addarticle?title='+encodeURIComponent(title)+'&url='+encodeURIComponent(url)+'&img='+encodeURIComponent(imgUrl)+'&desc='+encodeURIComponent(payload);window.open(target,'_blank');})();`;
    
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
            <p>Parallel zur Textanalyse lädt das System das beste erkannte Produktbild der Ursprungsseite herunter. Das Bild wird direkt in unseren integrierten Editor geladen. Dort wird es automatisch in das optimale 4:3-Format für Ihre Datenbank gebracht, wobei Sie jederzeit die Möglichkeit haben, den Bildausschnitt noch manuell anzupassen (zuschneiden).</p>
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