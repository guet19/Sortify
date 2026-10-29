// KI-Bildbearbeitung im Browser: Bild verkleinern, an Sortify schicken, Ergebnis abholen.
// Gegenstück: src/routes/(protected)/api/image-cleanup/+server.js (Cloudinary)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Bild laden – createImageBitmap berücksichtigt die Ausrichtung aus den Kameradaten (EXIF)
async function decode(blob) {
    if (typeof createImageBitmap === 'function') {
        try { return await createImageBitmap(blob); } catch { /* Fallback unten */ }
    }
    const url = URL.createObjectURL(blob);
    try {
        const img = new Image();
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
        return img;
    } finally {
        URL.revokeObjectURL(url);
    }
}

// Verkleinert ein Bild (längste Seite max. maxSide px) und speichert es als JPEG auf weissem Grund.
// Hält Uploads klein (Handyfotos haben oft 4–10 MB) und vermeidet schwarze Flächen bei Transparenz.
export async function downscaleToJpeg(blob, maxSide = 2000, quality = 0.88) {
    const img = await decode(blob);
    const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (typeof img.close === 'function') img.close();
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht umgewandelt werden.'))), 'image/jpeg', quality));
}

async function errorText(res, fallback) {
    try { return (await res.json()).error || fallback; } catch { return fallback; }
}

// mode: 'background' (Hintergrund entfernen) | 'text' (Schrift entfernen). Liefert das bearbeitete Bild.
export async function cleanImage(blob, mode) {
    const upload = await downscaleToJpeg(blob, 1600, 0.9);
    const form = new FormData();
    form.set('mode', mode);
    form.set('file', upload, 'bild.jpg');
    let res = await fetch('/api/image-cleanup', { method: 'POST', body: form, signal: AbortSignal.timeout(45_000) });

    // Cloudinary rechnet noch: in kurzen Abständen nachfragen (max. ca. 2 Minuten)
    const started = Date.now();
    while (res.status === 202) {
        const { job } = await res.json();
        if (Date.now() - started > 120_000) throw new Error('Cloudinary braucht zu lange. Bitte später erneut versuchen.');
        await sleep(2_000);
        res = await fetch(`/api/image-cleanup?job=${encodeURIComponent(job)}&mode=${mode}`, { signal: AbortSignal.timeout(30_000) });
    }
    if (!res.ok) throw new Error(await errorText(res, 'Das Bild konnte nicht bearbeitet werden.'));
    return res.blob();
}
