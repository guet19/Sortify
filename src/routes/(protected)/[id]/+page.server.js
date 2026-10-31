import db from '$lib/server/db.js';
import { actor } from '$lib/server/actor.js';
import { error, fail } from '@sveltejs/kit';
import { ObjectId } from 'mongodb'; // 🔥 NEU: Import hinzugefügt
import { lightUpArticle, turnOffArticle } from '$lib/server/leds.js';
import { projectsEnabled, listProjects, resolveBookingProject } from '$lib/server/projects.js';
import { selectableProjects } from '$lib/projects.js';
import { articleDrawers, findDrawer } from '$lib/barcodes.js';
import { openOrdersForArticle } from '$lib/server/orders.js';

export async function load({ params, locals }) { 
    // 1. Die System-ID aus dem Rucksack (locals) holen
    const systemId = locals.systemId;
    
    if (!systemId) {
        throw error(401, 'Kein aktives Lager ausgewählt');
    }

    // 2. Die Artikel-ID aus der URL auslesen
    const articleId = params.id;

    // 🔥 NEUER CHECK: Ist die ID in der URL überhaupt eine gültige 24-stellige MongoDB-ID?
    // Falls das Wort z.B. "einstellungen" lautet, wird hier sofort abgebrochen (404),
    // BEVOR die Datenbank mit einem BSON-Error abstürzt.
    if (!ObjectId.isValid(articleId)) {
        throw error(404, {
            message: 'Dieser Artikel existiert nicht (Ungültige ID).'
        });
    }

    // 3. Den spezifischen Artikel MIT der systemId aus der Datenbank holen
    const article = await db.getArticleById(systemId, articleId);

    // 4. Fehlerbehandlung: Wenn der Artikel nicht existiert oder nicht zum Lager gehört
    if (!article) {
        throw error(404, {
            message: 'Dieser Artikel wurde nicht gefunden oder gehört nicht zu diesem Lager.'
        });
    }

    // 5. Metadaten für das aktuelle Lager laden
    // Unabhängige Abfragen parallel statt nacheinander
    const [categories, attributes, movements, projectsOn, openOrders] = await Promise.all([
        db.getCategories(systemId),
        db.getFilterAttributes(systemId),
        db.getStockMovements(systemId, articleId, 20).catch(() => []),
        projectsEnabled(systemId),
        // Hinweis "bereits bestellt", damit niemand doppelt bestellt
        openOrdersForArticle(systemId, articleId).catch(() => [])
    ]);
    // Funktion "Projekte": offene Projekte für die Auswahl bei einer Entnahme
    const projectOptions = projectsOn ? selectableProjects(await listProjects(systemId)) : [];

    // 6. JSON-Parsen für das POJO-Problem von SvelteKit
    return {
        article: JSON.parse(JSON.stringify(article)),
        categories: JSON.parse(JSON.stringify(categories)),
        attributes: JSON.parse(JSON.stringify(attributes)),
        // LED-Farbe des Nutzers für den Leucht-Button
        userColor: locals.color || '#3b82f6',
        movements,
        projectsEnabled: projectsOn,
        projectOptions,
        openOrders
    };
}

// --- Action für das Speichern des Bestandes ---
export const actions = {
    // Lässt alle Fächer dieses Artikels im Regal aufleuchten (10 Sekunden)
    lightUp: async ({ params, locals }) => {
        if (!locals.systemId || !ObjectId.isValid(params.id)) return fail(400, { ledError: 'Ungültiger Artikel.' });
        try {
            const result = await lightUpArticle(locals.systemId, params.id, locals.color || '#3b82f6', locals.user.id);
            return result.success ? result : fail(400, { ledError: result.error });
        } catch (err) {
            console.error("Fehler beim Aufleuchten des Artikels:", err);
            return fail(500, { ledError: 'Das Regal konnte nicht angesteuert werden.' });
        }
    },

    // Schaltet die LEDs sofort aus (z.B. beim Verlassen der Seite)
    turnOffLED: async ({ params, locals }) => {
        if (!locals.systemId || !ObjectId.isValid(params.id)) return { success: false };
        try {
            return await turnOffArticle(locals.systemId, params.id, locals.user.id);
        } catch (err) {
            return { success: false };
        }
    },

    updateStock: async ({ request, locals }) => { 
        // 1. System-ID zwingend aus locals laden
        const systemId = locals.systemId;
        if (!systemId) {
            return { success: false, error: 'Kein aktives Lager ausgewählt' };
        }

        // 2. Daten aus dem Frontend-Formular abfangen
        const data = await request.formData();
        const articleId = data.get('articleId');
        const newStock = parseInt(data.get('newStock'), 10);

        // Sicherheitsprüfung des Wertes
        if (isNaN(newStock) || newStock < 0) {
            return { success: false, error: 'Ungültiger Bestand' };
        }
        
        // 🔥 ZUSATZ-CHECK: Auch beim Speichern absichern
        if (!ObjectId.isValid(articleId)) {
            return { success: false, error: 'Ungültige Artikel-ID' };
        }

        // Funktion "Projekte": Entnahmen brauchen ein Projekt, Zugänge können optional zurückgebucht werden
        const projectsOn = await projectsEnabled(systemId);
        const projectId = data.get('projectId')?.toString();
        let project = null;
        if (projectsOn && projectId) {
            project = await resolveBookingProject(systemId, projectId);
            if (!project) return fail(400, { stockError: 'Das gewählte Projekt ist nicht mehr offen. Bitte ein anderes wählen.' });
        }

        const article = await db.getArticleById(systemId, articleId);
        if (!article) return fail(404, { stockError: 'Artikel nicht gefunden.' });
        const meta = { ...actor(locals, 'web'), project, requireProject: projectsOn };

        // Eingelagerte Artikel: Bestand wird pro Fach geführt (Gesamtbestand = Summe der Fächer).
        // Bei einem Fach gilt die Änderung für dieses, bei mehreren muss das Fach gescannt worden sein.
        const drawers = articleDrawers(article);
        let drawer = null;
        if (drawers.length === 1) {
            drawer = drawers[0];
        } else if (drawers.length > 1) {
            const scanned = data.get('barcode')?.toString();
            if (!scanned) return fail(400, { stockError: 'Dieser Artikel liegt in mehreren Fächern. Bitte zuerst das Fach scannen.' });
            drawer = findDrawer(drawers, scanned);
            if (!drawer) return fail(400, { stockError: `Das Fach „${scanned}“ gehört nicht zu diesem Artikel.` });
        }

        try {
            if (drawer) {
                // newStock = neuer Bestand dieses Fachs
                await db.setDrawerStock(systemId, articleId, drawer.barcode, newStock, meta);
            } else {
                // Nicht eingelagert: nur der Gesamtbestand
                await db.updateArticle(systemId, articleId, { istBestand: newStock }, meta);
            }

            return { success: true };
        } catch (err) {
            if (err.code === 'project_required') {
                return fail(400, { stockError: 'Bitte wähle, für welches Projekt das Material entnommen wird.' });
            }
            if (err.code === 'unknown_drawer') {
                return fail(400, { stockError: 'Das Fach gehört nicht (mehr) zu diesem Artikel. Bitte Seite neu laden.' });
            }
            console.error("Fehler beim Aktualisieren des Bestandes:", err);
            return { success: false, error: "Bestand konnte nicht gespeichert werden." };
        }
    }
};