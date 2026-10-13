// Bild-Werkzeuge für den Artikelbild-Editor (Artikel anlegen & bearbeiten) – laufen im Browser

const ARTICLE_RATIO = 4 / 3;

function loadImage(blob) {
    const objectUrl = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ img, objectUrl });
        img.onerror = (err) => { URL.revokeObjectURL(objectUrl); reject(err); };
        img.src = objectUrl;
    });
}

const toJpeg = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));

// Legt ein Bild auf eine weisse 4:3-Fläche: Transparenz wird weiss (statt schwarz im JPEG)
// und das ganze Produkt bleibt sichtbar. Bilder, die schon 4:3 sind, bekommen keinen Rand.
export async function prepareOnWhite(blob) {
    let loaded;
    try {
        loaded = await loadImage(blob);
        const { img } = loaded;
        const w = img.naturalWidth, h = img.naturalHeight;
        const margin = Math.abs(w / h - ARTICLE_RATIO) < 0.03 ? 0 : 0.06;
        let canvasW = w * (1 + 2 * margin), canvasH = h * (1 + 2 * margin);
        if (canvasW / canvasH > ARTICLE_RATIO) canvasH = canvasW / ARTICLE_RATIO; else canvasW = canvasH * ARTICLE_RATIO;

        const scale = Math.min(1, 2400 / canvasW);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(canvasW * scale);
        canvas.height = Math.round(canvasH * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const drawW = w * scale, drawH = h * scale;
        ctx.drawImage(img, (canvas.width - drawW) / 2, (canvas.height - drawH) / 2, drawW, drawH);
        return await toJpeg(canvas);
    } catch (err) {
        console.warn('Bild konnte nicht aufbereitet werden, nutze Original:', err);
        return blob;
    } finally {
        if (loaded) URL.revokeObjectURL(loaded.objectUrl);
    }
}

// Dreht ein Bild um 90° (degrees: 90 = rechts, -90 = links). Transparenz bleibt erhalten (PNG).
export async function rotateBlob(blob, degrees) {
    const { img, objectUrl } = await loadImage(blob);
    try {
        const quarterTurn = Math.abs(degrees) % 180 === 90;
        const canvas = document.createElement('canvas');
        canvas.width = quarterTurn ? img.naturalHeight : img.naturalWidth;
        canvas.height = quarterTurn ? img.naturalWidth : img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((degrees * Math.PI) / 180);
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

// ==========================================
// MEHRERE BILDER PRO ARTIKEL
// ==========================================

export const MAX_ARTICLE_IMAGES = 8;
let imageCounter = 0;

// Eintrag der Bildleiste:
//   kind 'file' = neu zugeschnittenes Bild (blob), 'keep' = vorhandenes Artikelbild, 'url' = externer Link
export function imageItem(kind, { blob = null, url = '', sourceUrl = '' } = {}) {
    return { id: ++imageCounter, kind, blob, url, sourceUrl, preview: blob ? URL.createObjectURL(blob) : url };
}

// Alle Bilder eines Artikels (neues Format: images[], altes Format: nur imagePath)
export function articleImageUrls(article) {
    if (Array.isArray(article?.images) && article.images.length > 0) return article.images;
    return article?.imagePath ? [article.imagePath] : [];
}

// Hängt die Bilder in der gewählten Reihenfolge an das Formular (erstes Bild = Hauptbild)
export function appendImagesToFormData(formData, items) {
    const order = [];
    let fileIndex = 0;
    for (const item of items) {
        if (item.kind === 'file') {
            formData.append('imageFiles', item.blob, `bild-${fileIndex + 1}.jpg`);
            order.push({ type: 'file', index: fileIndex++ });
        } else {
            order.push({ type: item.kind, url: item.url });
        }
    }
    formData.set('imageOrder', JSON.stringify(order));
}
