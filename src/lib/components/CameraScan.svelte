<script>
    // Barcode per Handykamera scannen. Der erkannte Code wird in das vorhandene Scan-Feld (input)
    // geschrieben und dessen Formular abgeschickt – genau so, als hätte der Hand-Scanner getippt.
    // manualCapture (Terminal): Die Vorschau läuft, bis man den Code im Rahmen hat und „Erfassen“ drückt.
    // Gelesen wird dann nur der Rahmen, damit Codes von Nachbarfächern nicht dazwischenkommen.
    import { onDestroy, createEventDispatcher, tick as nextTick } from 'svelte';
    import { SCAN_FRAME, frameCrop } from '$lib/scanFrame.js';
    export let input = null;
    export let label = '📷 Mit Kamera scannen';
    export let manualCapture = false;

    const SCAN_EVERY_MS = 150;
    const SHOW_CODE_MS = 800;   // Anzeige bleibt kurz stehen, damit sie beim Zielen nicht flackert
    const FRESH_MS = 300;       // Beim Drücken zählt nur ein gerade gelesener Code, sonst der nächste
    const SEARCH_MS = 2000;     // So lange wird nach dem Drücken noch gesucht

    const dispatch = createEventDispatcher();
    const frameStyle = `left: ${SCAN_FRAME.left * 100}%; top: ${SCAN_FRAME.top * 100}%; width: ${SCAN_FRAME.width * 100}%; height: ${SCAN_FRAME.height * 100}%;`;
    let open = false;
    let video;
    let stream = null;
    let scanTimer = null;
    let searchTimer = null;
    let canvas = null;
    let message = '';
    let seenCode = '';       // liegt gerade im Rahmen
    let seenAt = 0;
    let searching = false;   // „Erfassen“ gedrückt, noch kein Code gelesen
    let hint = '';

    const hasCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

    async function start() {
        message = '';
        open = true;
        await nextTick(); // Video-Element erst nach dem Öffnen vorhanden
        try {
            const camera = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false
            });
            if (!open || stream) return camera.getTracks().forEach((t) => t.stop());
            stream = camera;
            video.srcObject = camera;
            await video.play();
            scan(await createDecoder(), camera);
        } catch (err) {
            if (!open) return;
            console.warn('Kamera nicht verfügbar:', err);
            message = err?.name === 'NotAllowedError'
                ? 'Kein Zugriff auf die Kamera. Bitte in den Browser-Einstellungen erlauben.'
                : 'Die Kamera konnte nicht gestartet werden.';
            cleanup();
        }
    }

    // Liefert eine Funktion, die den Code aus einem Bild liest
    async function createDecoder() {
        if ('BarcodeDetector' in window) {
            // Eingebaut in Chrome/Android – schnell, ohne Zusatzcode
            const detector = new window.BarcodeDetector();
            return async (image) => closestToCentre(await detector.detect(image), image)?.rawValue;
        }
        // iPhone/Safari & Firefox: Bibliothek erst bei Bedarf laden
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        return (image) => reader.decodeFromCanvas(image).getText();   // wirft, wenn kein Code im Bild ist
    }

    function closestToCentre(codes, image) {
        const distance = ({ boundingBox: b }) => Math.hypot(b.x + b.width / 2 - image.width / 2, b.y + b.height / 2 - image.height / 2);
        return [...codes].sort((a, b) => distance(a) - distance(b))[0];
    }

    // Aktuelles Kamerabild; bei manualCapture nur der Rahmen
    function grabImage() {
        const { videoWidth, videoHeight } = video;
        if (!videoWidth || !videoHeight) return null;
        const area = manualCapture
            ? frameCrop(videoWidth, videoHeight, video.clientWidth, video.clientHeight)
            : { x: 0, y: 0, width: videoWidth, height: videoHeight };
        canvas ||= document.createElement('canvas');
        canvas.width = area.width;
        canvas.height = area.height;
        canvas.getContext('2d', { willReadFrequently: true })
            .drawImage(video, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
        return canvas;
    }

    async function scan(decode, camera) {
        let code = '';
        try {
            const image = grabImage();
            if (image) code = String((await decode(image)) ?? '').trim();
        } catch { /* kein Code im Bild */ }
        if (stream !== camera) return;   // inzwischen geschlossen
        if (code) codeSeen(code);
        else if (Date.now() - seenAt > SHOW_CODE_MS) seenCode = '';
        if (stream === camera) scanTimer = setTimeout(() => scan(decode, camera), SCAN_EVERY_MS);
    }

    function codeSeen(code) {
        seenCode = code;
        seenAt = Date.now();
        hint = '';
        if (!manualCapture || searching) submit(code);
    }

    function capture() {
        if (seenCode && Date.now() - seenAt <= FRESH_MS) return submit(seenCode);
        hint = '';
        searching = true;
        searchTimer = setTimeout(() => {
            searching = false;
            hint = 'Kein Code im Rahmen erkannt. Etwas näher heran oder ruhiger halten.';
        }, SEARCH_MS);
    }

    function submit(value) {
        if (navigator.vibrate) navigator.vibrate(80);
        close();
        dispatch('scan', value);
        if (input) {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.form?.requestSubmit();
        }
    }

    function cleanup() {
        clearTimeout(scanTimer);
        clearTimeout(searchTimer);
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
    }

    function close() {
        cleanup();
        open = false;
        seenCode = '';
        seenAt = 0;
        searching = false;
        hint = '';
    }

    onDestroy(cleanup);
</script>

{#if hasCamera}
    <button type="button" class="camera-btn" on:click|stopPropagation={start}>{label}</button>
{/if}

{#if open || message}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="camera-overlay" on:click|self={() => { close(); message = ''; }}>
        <div class="camera-box">
            {#if message}
                <p class="camera-msg">{message}</p>
            {:else}
                <div class="camera-view">
                    <!-- svelte-ignore a11y_media_has_caption -->
                    <video bind:this={video} playsinline muted></video>
                    <div class="camera-frame" class:waiting={manualCapture && !seenCode} style={frameStyle}></div>
                </div>
                {#if manualCapture}
                    <p class="camera-status" role="status">
                        {#if seenCode}
                            <span class="camera-seen">Im Rahmen: <strong>{seenCode}</strong></span>
                        {:else if hint}
                            <span class="camera-none">{hint}</span>
                        {:else}
                            Code in den Rahmen halten, dann „Erfassen“ drücken
                        {/if}
                    </p>
                    <button type="button" class="camera-capture" disabled={searching} on:click|stopPropagation={capture}>
                        {searching ? 'Suche Code…' : '✓ Erfassen'}
                    </button>
                {:else}
                    <p class="camera-hint">Barcode in den Rahmen halten…</p>
                {/if}
            {/if}
            <button type="button" class="camera-close" on:click={() => { close(); message = ''; }}>Abbrechen</button>
        </div>
    </div>
{/if}

<style>
    .camera-btn { background: #1e293b; color: #e2e8f0; border: 1px solid #475569; border-radius: 8px; padding: 0.7rem 1.1rem; font-weight: 600; font-size: 1rem; cursor: pointer; font-family: inherit; margin-top: 0.75rem; }
    .camera-btn:hover { border-color: #60a5fa; color: #fff; }
    .camera-overlay { position: fixed; inset: 0; background: rgba(2, 6, 23, 0.85); z-index: 2000; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .camera-box { width: 100%; max-width: 480px; max-height: 100%; overflow-y: auto; box-sizing: border-box; background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    /* max-height: Auf dem quer gehaltenen Handy bleiben so die Buttons sichtbar */
    .camera-view { position: relative; flex: none; width: 100%; aspect-ratio: 4 / 3; max-height: 42vh; overflow: hidden; border-radius: 8px; background: #000; }
    video { display: block; width: 100%; height: 100%; object-fit: cover; }
    .camera-frame { position: absolute; box-sizing: border-box; border: 3px solid #22c55e; border-radius: 10px; box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35); pointer-events: none; }
    .camera-frame.waiting { border-color: #e2e8f0; }
    .camera-hint, .camera-msg { margin: 0; text-align: center; color: #cbd5e1; }
    .camera-msg { color: #fca5a5; padding: 1rem 0; }
    /* Feste Höhe: Die Vorschau soll beim Zielen nicht springen */
    .camera-status { margin: 0; min-height: 2.6em; display: flex; align-items: center; justify-content: center; text-align: center; color: #cbd5e1; font-size: 0.95rem; line-height: 1.3; }
    .camera-seen { display: block; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .camera-seen strong { color: #86efac; font-family: monospace; font-size: 1.2rem; }
    .camera-none { color: #fca5a5; }
    .camera-capture { background: #22c55e; color: #052e16; border: none; border-radius: 8px; padding: 0.9rem; font-size: 1.1rem; font-weight: 700; cursor: pointer; font-family: inherit; }
    .camera-capture:hover:not(:disabled) { background: #16a34a; color: #fff; }
    .camera-capture:disabled { background: #334155; color: #cbd5e1; cursor: wait; }
    .camera-close { background: #334155; color: #fff; border: none; border-radius: 8px; padding: 0.7rem; font-weight: 600; cursor: pointer; font-family: inherit; }
</style>
