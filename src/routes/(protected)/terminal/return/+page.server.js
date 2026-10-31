import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { actor } from '$lib/server/actor.js';
import { scheduleLedsOff, cancelLedsOff } from '$lib/server/leds.js';
import { scaleTarget } from '$lib/server/devices.js';
import { projectsEnabled, listProjects, resolveBookingProject } from '$lib/server/projects.js';
import { selectableProjects } from '$lib/projects.js';

// Funktion "Projekte": Projekt aus dem Formular prüfen und für die Buchung vorbereiten.
// Liefert { meta } oder { error } (Code für die Oberfläche)
async function bookingMeta(systemId, data, locals, source) {
    const base = actor(locals, source);
    if (!(await projectsEnabled(systemId))) return { meta: base };
    const projectId = data.get('projectId')?.toString();
    const project = projectId ? await resolveBookingProject(systemId, projectId) : null;
    if (projectId && !project) return { error: 'project_closed' };
    return { meta: { ...base, project, requireProject: true } };
}

export async function load({ locals }) { 
    const systemId = locals.systemId;
    
    // Wenn kein Lager ausgewählt ist, zurück zum Login/Systemauswahl
    if (!systemId) throw redirect(303, '/login');

    const [articles, projectsOn] = await Promise.all([db.getArticles(systemId).catch(() => []), projectsEnabled(systemId)]);
    
    return {
        articles: JSON.parse(JSON.stringify(articles)),
        projectsEnabled: projectsOn,
        projectOptions: projectsOn ? selectableProjects(await listProjects(systemId)) : [],
        // 🔥 NEU: Farbe auslesen und an das Frontend übergeben
        userColor: locals.color || '#3b82f6' 
    };
}

export const actions = {
    scanForReturn: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        const barcode = data.get('barcode');

        if (!barcode || barcode.trim() === '') {
            return { success: false, error: 'invalid_barcode' };
        }

        try {
            // Unabhängige Abfragen parallel statt nacheinander
            const [article, drawer] = await Promise.all([
                db.getArticleByBarcode(systemId, barcode),
                db.getDrawerByBarcode(systemId, barcode)
            ]);

            if (!article || !drawer) {
                return { success: false, error: 'unknown_barcode' };
            }

            if (drawer.boxWeight === undefined || drawer.boxWeight === null || !article.attributes?.itemWeight) {
                return { success: false, error: 'missing_weights', article: JSON.parse(JSON.stringify(article)) };
            }
            
            return { 
                success: true, 
                step: 'instruction', 
                article: JSON.parse(JSON.stringify(article)),
                boxWeight: drawer.boxWeight 
            };

        } catch (err) {
            console.error("🔴 Fehler in Action scanForReturn:", err);
            return { success: false, error: 'Datenbankfehler' };
        }
    },

    requestScale: async ({ request, locals, cookies }) => {
        const systemId = locals.systemId;
        if (!systemId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        const barcode = data.get('barcode');

        // Gewogen wird am Terminal dieses Browsers (sonst am Terminal des Regals)
        const target = await scaleTarget(systemId, cookies, { barcode });
        if (target.error) return { success: false, error: 'choose_terminal' };

        // Ältere Terminals messen sofort: kurz warten, bis die Kiste ruhig steht (ab 2.3.0 wartet das Terminal selbst)
        if (!target.settles) await new Promise(resolve => setTimeout(resolve, 1000));
        const requestId = await db.createScaleRequest(systemId, barcode, { deviceId: target.deviceId });
        return { success: true, requestId };
    },

    bookReturn: async ({ request, locals }) => {
        const systemId = locals.systemId;
        // 🔥 NEU: Farbe aus dem Hook laden
        const userColor = locals.color || '#3b82f6';
        if (!systemId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');
        const newDrawerStock = parseInt(data.get('newStock'));

        if (!articleId || !barcode || isNaN(newDrawerStock)) {
            return { success: false, error: 'Fehlende Buchungsdaten' };
        }
        const { meta, error: projectError } = await bookingMeta(systemId, data, locals, 'terminal-rueckgabe');
        if (projectError) return { success: false, error: projectError };

        try {
            // Bestand buchen
            await db.updateArticleStockFromWeights(systemId, articleId, barcode, newDrawerStock, meta);
            
            cancelLedsOff(systemId);
            // 🔥 NEU: userColor statt 'true' an die Hardware übergeben
            await db.triggerLedByBarcode(systemId, barcode, userColor);
            
            scheduleLedsOff(systemId, 10000);

            return { success: true, step: 'done' };
        } catch (err) {
            if (err.code === 'project_required') return { success: false, error: 'project_required' };
            console.error("🔴 Fehler in Action bookReturn:", err);
            return { success: false, error: 'Buchungsfehler' };
        }
    },

    returnWithoutWeighing: async ({ request, locals }) => {
        const systemId = locals.systemId;
        // 🔥 NEU: Farbe aus dem Hook laden
        const userColor = locals.color || '#3b82f6';
        if (!systemId) return { success: false };

        const data = await request.formData();
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');

        if (!articleId || !barcode) {
            return { success: false, error: 'Fehlende Daten' };
        }

        try {
            await db.logArticleAction(systemId, articleId, 'return');
            
            cancelLedsOff(systemId);
            // 🔥 NEU: userColor statt 'true' an die Hardware übergeben
            await db.triggerLedByBarcode(systemId, barcode, userColor);
            
            scheduleLedsOff(systemId, 10000);

            return { success: true, step: 'done' };
        } catch (err) {
            console.error("🔴 Fehler in Action returnWithoutWeighing:", err);
            return { success: false };
        }
    },

    bookAndUnlink: async ({ request, locals }) => {
        const systemId = locals.systemId;
        // 🔥 NEU: Farbe aus dem Hook laden
        const userColor = locals.color || '#3b82f6';
        if (!systemId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        const articleId = data.get('articleId');
        const barcode = data.get('barcode');
        const { meta, error: projectError } = await bookingMeta(systemId, data, locals, 'terminal-fach-leer');
        if (projectError) return { success: false, error: projectError };

        try {
            await db.updateArticleStockFromWeights(systemId, articleId, barcode, 0, meta);
            await db.removeBarcodes(systemId, articleId, barcode, actor(locals, 'terminal-fach-leer'));

            cancelLedsOff(systemId);
            // 🔥 NEU: userColor statt 'true' an die Hardware übergeben
            await db.triggerLedByBarcode(systemId, barcode, userColor);
            
            scheduleLedsOff(systemId, 10000);

            return { success: true, step: 'done', unlinked: true };
        } catch (err) {
            if (err.code === 'project_required') return { success: false, error: 'project_required' };
            console.error("Fehler beim Freigeben des leeren Fachs:", err);
            return { success: false, error: 'Fehler beim Freigeben' };
        }
    },

    triggerLedOnly: async ({ request, locals }) => {
        const systemId = locals.systemId;
        // 🔥 NEU: Farbe aus dem Hook laden
        const userColor = locals.color || '#3b82f6';
        if (!systemId) return { success: false, error: 'Unauthorized' };

        const data = await request.formData();
        const barcode = data.get('barcode');
        
        try {
            cancelLedsOff(systemId);

            // 🔥 NEU: userColor statt 'true' an die Hardware übergeben
            await db.triggerLedByBarcode(systemId, barcode, userColor);
            
            scheduleLedsOff(systemId, 10000);

            return { success: true };
        } catch (err) {
            return { success: false };
        }
    }
};