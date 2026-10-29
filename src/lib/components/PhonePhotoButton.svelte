<script>
    // "Foto mit Smartphone": zeigt einen QR-Code; Fotos vom Handy kommen automatisch in den Bild-Editor.
    // onPhoto(blob) wird für jedes empfangene Foto aufgerufen (der Editor reiht sie bei Bedarf ein).
    import { onDestroy } from 'svelte';

    export let disabled = false;
    export let onPhoto = () => {};

    let session = null;   // { id, link, qr, expiresAt }
    let starting = false;
    let error = '';
    let received = 0;
    let minutesLeft = 0;
    let pollTimer;
    let clock;
    let copied = false;

    async function start() {
        if (session || starting) return;
        starting = true;
        error = '';
        try {
            const res = await fetch('/api/photo-session', { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Der QR-Code konnte nicht erstellt werden.');
            session = data;
            received = 0;
            updateClock();
            clock = setInterval(updateClock, 15000);
            poll();
        } catch (e) {
            error = e.message;
        } finally {
            starting = false;
        }
    }

    function updateClock() {
        if (!session) return;
        const ms = new Date(session.expiresAt).getTime() - Date.now();
        minutesLeft = Math.max(0, Math.ceil(ms / 60000));
        if (ms <= 0) stop('Der QR-Code ist abgelaufen. Bei Bedarf einen neuen erzeugen.');
    }

    async function poll() {
        clearTimeout(pollTimer);
        if (!session) return;
        const current = session;
        try {
            const res = await fetch(`/api/photo-session/${current.id}`, { cache: 'no-store' });
            const data = await res.json().catch(() => ({}));
            if (data.status === 'expired') return stop('Der QR-Code ist abgelaufen. Bei Bedarf einen neuen erzeugen.');
            for (const photoId of data.photos || []) {
                const photo = await fetch(`/api/photo-session/${current.id}/${photoId}`, { cache: 'no-store' });
                if (photo.ok) {
                    received += 1;
                    await onPhoto(await photo.blob());
                }
            }
        } catch {
            // kurzer Netzaussetzer: beim nächsten Durchlauf erneut versuchen
        }
        if (session === current) pollTimer = setTimeout(poll, 2000);
    }

    function stop(message = '') {
        clearTimeout(pollTimer);
        clearInterval(clock);
        if (session) {
            fetch(`/api/photo-session/${session.id}`, { method: 'DELETE', keepalive: true }).catch(() => {});
        }
        session = null;
        error = message;
    }

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(session.link);
            copied = true;
            setTimeout(() => (copied = false), 2000);
        } catch { /* Kopieren nicht erlaubt: Link ist ohnehin sichtbar */ }
    }

    onDestroy(() => stop());
</script>

{#if session}
    <div class="phone-panel">
        <img src={session.qr} alt="QR-Code für die Handykamera" width="180" height="180" />
        <div class="phone-text">
            <strong>Mit der Handykamera scannen</strong>
            <span>Auf dem Handy öffnet sich eine Seite zum Fotografieren. Jedes Foto erscheint hier automatisch im Bild-Editor.</span>
            <span class="phone-status" role="status">
                {received ? `✅ ${received} ${received === 1 ? 'Foto' : 'Fotos'} empfangen · ` : ''}wartet auf Fotos… (noch {minutesLeft} Min.)
            </span>
            <span class="phone-actions">
                <button type="button" class="btn-link" on:click={copyLink}>{copied ? 'Link kopiert' : 'Link kopieren'}</button>
                <button type="button" class="btn-done" on:click={() => stop()}>Fertig</button>
            </span>
        </div>
    </div>
{:else}
    <button type="button" class="btn-phone" on:click={start} disabled={disabled || starting}>
        📱 {starting ? 'QR-Code wird erstellt…' : 'Foto mit Smartphone aufnehmen'}
    </button>
{/if}
{#if error}<div class="phone-error" role="alert">{error}</div>{/if}

<style>
    .btn-phone { background: #ffffff; color: #1e293b; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0.55rem 0.9rem; font-weight: 600; font-size: 0.9rem; cursor: pointer; font-family: inherit; }
    .btn-phone:hover:not(:disabled) { border-color: #3b82f6; color: #1d4ed8; }
    .btn-phone:disabled { opacity: 0.6; cursor: not-allowed; }
    .phone-panel { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; background: #ffffff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 0.85rem; }
    .phone-panel img { width: 180px; height: 180px; flex: none; image-rendering: pixelated; }
    .phone-text { display: flex; flex-direction: column; gap: 0.35rem; flex: 1 1 200px; min-width: 0; color: #334155; font-size: 0.9rem; }
    .phone-text strong { color: #1e293b; font-size: 1rem; }
    .phone-status { color: #2563eb; font-weight: 600; }
    .phone-actions { display: flex; gap: 0.75rem; align-items: center; margin-top: 0.25rem; }
    .btn-link { background: none; border: none; color: #2563eb; font-weight: 600; cursor: pointer; padding: 0; font-family: inherit; font-size: 0.88rem; }
    .btn-done { background: #1e293b; color: #fff; border: none; border-radius: 6px; padding: 0.4rem 0.9rem; font-weight: 600; cursor: pointer; font-family: inherit; }
    .phone-error { margin-top: 0.4rem; color: #b91c1c; font-size: 0.85rem; font-weight: 600; }
</style>
