<script>
    // Barcode per Handykamera scannen. Der erkannte Code wird in das vorhandene Scan-Feld (input)
    // geschrieben und dessen Formular abgeschickt – genau so, als hätte der Hand-Scanner getippt.
    import { onDestroy, createEventDispatcher, tick as nextTick } from 'svelte';
    export let input = null;
    export let label = '📷 Mit Kamera scannen';

    const dispatch = createEventDispatcher();
    let open = false;
    let video;
    let stream = null;
    let stopZxing = null;
    let frame = null;
    let message = '';

    const hasCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

    async function start() {
        message = '';
        open = true;
        await nextTick(); // Video-Element erst nach dem Öffnen vorhanden
        try {
            if ('BarcodeDetector' in window) {
                // Eingebaut in Chrome/Android – schnell, ohne Zusatzcode
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
                video.srcObject = stream;
                await video.play();
                const detector = new window.BarcodeDetector();
                const tick = async () => {
                    if (!open) return;
                    try {
                        const codes = await detector.detect(video);
                        if (codes.length) return found(codes[0].rawValue);
                    } catch { /* Bild noch nicht bereit */ }
                    frame = requestAnimationFrame(tick);
                };
                tick();
            } else {
                // iPhone/Safari & Firefox: Bibliothek erst bei Bedarf laden
                const { BrowserMultiFormatReader } = await import('@zxing/browser');
                const reader = new BrowserMultiFormatReader();
                const controls = await reader.decodeFromConstraints(
                    { video: { facingMode: { ideal: 'environment' } }, audio: false },
                    video,
                    (result) => { if (result) found(result.getText()); }
                );
                stopZxing = () => controls.stop();
            }
        } catch (err) {
            console.warn('Kamera nicht verfügbar:', err);
            message = err?.name === 'NotAllowedError'
                ? 'Kein Zugriff auf die Kamera. Bitte in den Browser-Einstellungen erlauben.'
                : 'Die Kamera konnte nicht gestartet werden.';
            cleanup();
        }
    }

    function found(code) {
        const value = String(code || '').trim();
        if (!value) return;
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
        if (frame) cancelAnimationFrame(frame);
        frame = null;
        stopZxing?.();
        stopZxing = null;
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
    }

    function close() {
        cleanup();
        open = false;
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
                <!-- svelte-ignore a11y_media_has_caption -->
                <video bind:this={video} playsinline muted></video>
                <div class="camera-frame"></div>
                <p class="camera-hint">Barcode in den Rahmen halten…</p>
            {/if}
            <button type="button" class="camera-close" on:click={() => { close(); message = ''; }}>Abbrechen</button>
        </div>
    </div>
{/if}

<style>
    .camera-btn { background: #1e293b; color: #e2e8f0; border: 1px solid #475569; border-radius: 8px; padding: 0.7rem 1.1rem; font-weight: 600; font-size: 1rem; cursor: pointer; font-family: inherit; margin-top: 0.75rem; }
    .camera-btn:hover { border-color: #60a5fa; color: #fff; }
    .camera-overlay { position: fixed; inset: 0; background: rgba(2, 6, 23, 0.85); z-index: 2000; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .camera-box { position: relative; width: 100%; max-width: 480px; background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    video { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 8px; background: #000; }
    .camera-frame { position: absolute; left: 18%; right: 18%; top: 22%; height: 30%; border: 3px solid #22c55e; border-radius: 10px; box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.15); pointer-events: none; }
    .camera-hint, .camera-msg { margin: 0; text-align: center; color: #cbd5e1; }
    .camera-msg { color: #fca5a5; padding: 1rem 0; }
    .camera-close { background: #334155; color: #fff; border: none; border-radius: 8px; padding: 0.7rem; font-weight: 600; cursor: pointer; font-family: inherit; }
</style>
