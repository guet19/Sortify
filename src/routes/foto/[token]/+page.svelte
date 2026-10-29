<script>
    // Handy-Seite: Fotos aufnehmen und an den PC übertragen (geöffnet über den QR-Code beim Artikel anlegen)
    import { onMount, onDestroy } from 'svelte';
    import { downscaleToJpeg } from '$lib/imageAi.js';
    export let data;

    let uploaded = data.uploaded || 0;
    let sent = [];          // Vorschaubilder der übertragenen Fotos (nur auf diesem Handy)
    let busy = false;
    let error = '';
    let expired = !data.valid;
    let minutesLeft = 0;
    let clock;

    function updateClock() {
        if (!data.valid) return;
        const ms = new Date(data.expiresAt).getTime() - Date.now();
        minutesLeft = Math.max(0, Math.ceil(ms / 60000));
        if (ms <= 0) expired = true;
    }
    onMount(() => { updateClock(); clock = setInterval(updateClock, 15000); });
    onDestroy(() => { clearInterval(clock); sent.forEach((s) => URL.revokeObjectURL(s)); });

    $: full = uploaded >= (data.max || 8);

    async function handlePhoto(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || busy) return;
        busy = true;
        error = '';
        try {
            // Im Handy verkleinern: schneller Upload auch bei schwachem Empfang
            const photo = await downscaleToJpeg(file, 2000, 0.85);
            const res = await fetch(`/api/photo-upload/${data.token}`, {
                method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: photo, signal: AbortSignal.timeout(60000)
            });
            const result = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (res.status === 410) expired = true;
                throw new Error(result.error || 'Das Foto konnte nicht übertragen werden.');
            }
            uploaded = result.uploaded ?? uploaded + 1;
            sent = [...sent, URL.createObjectURL(photo)];
        } catch (e) {
            error = e?.name === 'TimeoutError' ? 'Die Übertragung hat zu lange gedauert. Bitte erneut versuchen.'
                : (e?.message?.includes('umgewandelt') ? 'Dieses Foto lässt sich nicht verarbeiten. Bitte direkt mit der Kamera aufnehmen.' : (e?.message || 'Fehler beim Übertragen.'));
        } finally {
            busy = false;
        }
    }
</script>

<svelte:head>
    <title>Foto für Sortify</title>
    <meta name="robots" content="noindex" />
</svelte:head>

<main class="phone-page space-grotesk">
    <div class="brand">Sortify</div>

    {#if expired}
        <section class="card">
            <h1>QR-Code abgelaufen</h1>
            <p class="muted">Bitte am Computer beim Artikel einen neuen QR-Code erzeugen und erneut scannen.</p>
        </section>
    {:else}
        <section class="card">
            <h1>Foto für den Artikel</h1>
            <p class="muted">Das Foto erscheint gleich am Computer im Bild-Editor. Dort kannst du es zuschneiden.</p>

            {#if full}
                <p class="done">Alle {data.max} Fotos übertragen.</p>
            {:else}
                <label class="camera-btn" class:disabled={busy}>
                    <input type="file" accept="image/*" capture="environment" on:change={handlePhoto} disabled={busy} />
                    {#if busy}
                        <span class="spinner"></span> Wird übertragen…
                    {:else}
                        📷 {uploaded ? 'Weiteres Foto aufnehmen' : 'Foto aufnehmen'}
                    {/if}
                </label>
            {/if}

            {#if error}<p class="error" role="alert">{error}</p>{/if}

            {#if uploaded}
                <p class="status">✅ {uploaded} {uploaded === 1 ? 'Foto' : 'Fotos'} an den Computer übertragen</p>
            {/if}
            {#if sent.length}
                <div class="thumbs">
                    {#each sent as src, i (src)}<img {src} alt="Übertragenes Foto {i + 1}" />{/each}
                </div>
            {/if}

            <p class="small">Dieser QR-Code gilt noch {minutesLeft} {minutesLeft === 1 ? 'Minute' : 'Minuten'} für höchstens {data.max} Fotos.</p>
        </section>
    {/if}
</main>

<style>
    .phone-page { min-height: 100vh; min-height: 100dvh; box-sizing: border-box; padding: 1.25rem max(16px, env(safe-area-inset-left, 0px)) 2rem max(16px, env(safe-area-inset-right, 0px)); display: flex; flex-direction: column; gap: 1rem; max-width: 520px; margin: 0 auto; color: #e2e8f0; }
    .brand { color: #22c55e; font-size: 1.4rem; font-weight: 700; }
    .card { background: #13243b; border: 1px solid #1f3a5c; border-radius: 14px; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.9rem; }
    h1 { margin: 0; font-size: 1.5rem; color: #f8fafc; }
    .muted { margin: 0; color: #94a3b8; }
    .camera-btn { display: flex; align-items: center; justify-content: center; gap: 0.6rem; min-height: 64px; border-radius: 12px; background: #22c55e; color: #052e16; font-size: 1.2rem; font-weight: 700; cursor: pointer; text-align: center; padding: 0.5rem 1rem; }
    .camera-btn.disabled { background: #4b5563; color: #e5e7eb; cursor: wait; }
    .camera-btn input { display: none; }
    .status { margin: 0; color: #86efac; font-weight: 600; }
    .done { margin: 0; color: #86efac; font-weight: 700; }
    .error { margin: 0; color: #fca5a5; font-weight: 600; }
    .small { margin: 0; color: #64748b; font-size: 0.85rem; }
    .thumbs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.4rem; }
    .thumbs img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; border: 1px solid #1f3a5c; }
    .spinner { width: 18px; height: 18px; border: 3px solid rgba(255, 255, 255, 0.35); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
</style>
