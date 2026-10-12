import db from '$lib/server/db.js';

// Ein Abschalt-Timer PRO LAGER. Vorher teilten sich alle Lager eine globale Variable,
// sodass ein Lager den Timer eines anderen abbrechen konnte.
// Hinweis: In Serverless-Umgebungen ist ein Timer nach der Antwort nicht garantiert.
// Zuverlässig wäre eine Leuchtdauer im Hardware-Befehl, die der Pi selbst auswertet.
const ledOffTimers = new Map();

export function cancelLedsOff(systemId) {
    const key = String(systemId);
    const timer = ledOffTimers.get(key);
    if (timer) {
        clearTimeout(timer);
        ledOffTimers.delete(key);
    }
}

export function scheduleLedsOff(systemId, delayMs) {
    cancelLedsOff(systemId);
    const key = String(systemId);
    ledOffTimers.set(key, setTimeout(async () => {
        ledOffTimers.delete(key);
        try { await db.createHardwareCommand(systemId, [0]); } catch (e) {}
    }, delayMs));
}

// ==========================================
// ARTIKEL AUFLEUCHTEN LASSEN (Web-Ansicht & Terminal-Suche)
// ==========================================

const ARTICLE_LIGHT_DURATION_MS = 10000;
// Ein Abschalt-Timer pro Nutzer: Ein neuer Klick verlängert die eigene Anzeige, ohne andere zu stören
const articleLightTimers = new Map();

// Alle Fächer (Barcodes) eines Artikels – unterstützt alte und neue Datenformate
export function getArticleBarcodes(article) {
    if (Array.isArray(article?.assigned_barcodes) && article.assigned_barcodes.length > 0) {
        return article.assigned_barcodes.map(b => (typeof b === 'object' ? b.barcode : b)).filter(Boolean);
    }
    return article?.assigned_barcode ? [article.assigned_barcode] : [];
}

// Die Fächer werden auf dem Server aus der Artikel-ID ermittelt (nicht vom Browser übernommen)
export async function lightUpArticle(systemId, articleId, color, userKey) {
    const article = await db.getArticleById(systemId, articleId);
    if (!article) return { success: false, error: 'Artikel nicht gefunden' };

    const barcodes = getArticleBarcodes(article);
    if (barcodes.length === 0) return { success: false, error: 'Nicht eingelagert' };

    await db.triggerLedsByBarcodeArray(systemId, barcodes, color);

    const key = String(userKey);
    if (articleLightTimers.has(key)) clearTimeout(articleLightTimers.get(key));
    articleLightTimers.set(key, setTimeout(async () => {
        articleLightTimers.delete(key);
        try { await db.triggerLedsByBarcodeArray(systemId, barcodes, '#000000'); } catch (e) {}
    }, ARTICLE_LIGHT_DURATION_MS));

    return { success: true, durationMs: ARTICLE_LIGHT_DURATION_MS };
}

// Sofort ausschalten (z.B. wenn die Seite verlassen wird)
export async function turnOffArticle(systemId, articleId, userKey) {
    const key = String(userKey);
    if (articleLightTimers.has(key)) {
        clearTimeout(articleLightTimers.get(key));
        articleLightTimers.delete(key);
    }
    const article = await db.getArticleById(systemId, articleId);
    const barcodes = getArticleBarcodes(article);
    if (barcodes.length > 0) await db.triggerLedsByBarcodeArray(systemId, barcodes, '#000000');
    return { success: true };
}
