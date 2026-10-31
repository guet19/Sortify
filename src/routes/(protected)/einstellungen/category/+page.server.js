import { fail, error } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { applyCategoryStructure } from '$lib/server/categoryStructure.js';

export async function load({ locals }) { 
    // 1. Aktives Lager (System) identifizieren
    const systemId = locals.systemId;
    if (!systemId) {
        throw error(401, 'Kein aktives Lager ausgewählt');
    }

    // 2. Alle Datenabfragen streng auf das aktuelle Lager filtern
    const [categories, filterAttributes, articles] = await Promise.all([
        db.getCategories(systemId),
        db.getFilterAttributes(systemId),
        db.getArticles(systemId)
    ]);
    
    // POJO-Fix für die sichere Übertragung an SvelteKit
    return {
        categories: JSON.parse(JSON.stringify(categories)),
        filterAttributes: JSON.parse(JSON.stringify(filterAttributes)),
        articles: JSON.parse(JSON.stringify(articles))
    };
}

export const actions = {
    createMain: async ({ request, locals }) => { 
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { errorMain: "Kein aktives Lager ausgewählt." });

        const data = await request.formData();
        const name = data.get('name');
        if (!name) return fail(400, { errorMain: "Bitte einen Namen eingeben." });

        try {
            const newId = await db.createMainCategory(systemId, name.trim());
            return { successMain: true, newId: newId ? newId.toString() : null };
        } catch (err) {
            return fail(500, { errorMain: "Datenbankfehler beim Speichern." });
        }
    },

    createSub: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { errorSub: "Kein aktives Lager ausgewählt." });

        const data = await request.formData();
        const mainId = data.get('mainId');
        const subName = data.get('subName');
        if (!mainId || !subName) return fail(400, { errorSub: "Daten unvollständig." });

        try {
            await db.createSubcategory(systemId, mainId, subName.trim());
            return { successSub: true };
        } catch (err) {
            return fail(500, { errorSub: "Datenbankfehler beim Speichern." });
        }
    },

    deleteSub: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { errorDelete: "Kein aktives Lager ausgewählt." });

        const data = await request.formData();
        const mainId = data.get('mainId');
        const subId = data.get('subId');
        if (!mainId || !subId) return fail(400, { errorDelete: "IDs fehlen." });

        try {
            await db.deleteSubcategory(systemId, mainId, subId);
            return { successDelete: true };
        } catch (err) {
            return fail(500, { errorDelete: "Datenbankfehler beim Löschen." });
        }
    },

    deleteMain: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { errorDeleteMain: "Kein aktives Lager ausgewählt." });

        const data = await request.formData();
        const mainId = data.get('mainId');
        if (!mainId) return fail(400, { errorDeleteMain: "ID fehlt." });

        try {
            await db.deleteMainCategory(systemId, mainId);
            return { successDeleteMain: true };
        } catch (err) {
            return fail(500, { errorDeleteMain: "Datenbankfehler beim Löschen." });
        }
    },

    bulkDeleteSubs: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { errorBulkDelete: "Kein aktives Lager ausgewählt." });

        const data = await request.formData();
        const mainId = data.get('mainId');
        const subIds = data.getAll('subIds');

        if (!mainId || !subIds || subIds.length === 0) {
            return fail(400, { errorBulkDelete: "Daten für Massenlöschung unvollständig." });
        }

        try {
            for (const subId of subIds) {
                await db.deleteSubcategory(systemId, mainId, subId);
            }
            return { successBulkDelete: true };
        } catch (err) {
            return fail(500, { errorBulkDelete: "Fehler beim Massenlöschen." });
        }
    },

    updateAttributes: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { errorAttr: "Kein aktives Lager ausgewählt." });

        const data = await request.formData();
        const mainId = data.get('mainId');
        const subId = data.get('subId');
        if (!mainId || !subId) return fail(400, { errorAttr: "IDs fehlen." });

        try {
            // Nur vorhandene Filter dieses Lagers, jeden einmal
            const submitted = [...new Set(data.getAll('attributes').map(String))];
            const known = new Set((await db.getFilterAttributes(systemId)).map((a) => String(a._id)));
            // getFilterAttributes liefert bei einem Datenbankfehler eine leere Liste – dann nichts überschreiben
            if (submitted.length > 0 && known.size === 0) return fail(500, { errorAttr: "Die Filter konnten nicht geladen werden. Bitte erneut versuchen." });
            const attributeIds = submitted.filter((id) => known.has(id));
            await db.updateSubcategoryAttributes(systemId, mainId, subId, attributeIds);
            return { successAttr: true };
        } catch (err) {
            return fail(500, { errorAttr: "Fehler beim Zuweisen." });
        }
    },

    renameMain: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { errorRename: "Kein aktives Lager ausgewählt." });

        const data = await request.formData();
        const id = data.get('id');
        const newName = data.get('newName');
        if (!id || !newName) return fail(400, { errorRename: "Daten fehlen." });

        try {
            await db.renameMainCategory(systemId, id, newName.trim());
            return { successRename: true };
        } catch (err) {
            return fail(500, { errorRename: "Fehler beim Umbenennen." });
        }
    },

    renameSub: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { errorRenameSub: "Kein aktives Lager ausgewählt." });

        const data = await request.formData();
        const mainId = data.get('mainId');
        const subId = data.get('subId');
        const newName = data.get('newName');

        if (!mainId || !subId || !newName) return fail(400, { errorRenameSub: "Daten fehlen." });

        try {
            await db.renameSubcategory(systemId, mainId, subId, newName.trim());
            return { successRenameSub: true };
        } catch (err) {
            return fail(500, { errorRenameSub: "Fehler beim Umbenennen der Unterkategorie." });
        }
    },

    // ==========================================
    // 🔥 NEU: KI-STRUKTUR SPEICHERN & ANWENDEN
    // ==========================================
    applyAiStructure: async ({ request, locals }) => {
        if (!locals.systemId) return fail(401, { errorAi: "Kein aktives Lager ausgewählt." });
        try {
            const result = await applyCategoryStructure(locals.systemId, await request.formData());
            if (result.error) return fail(result.status, { errorAi: result.error });
            return { success: true };
        } catch (err) {
            console.error("Fehler bei applyAiStructure:", err);
            return fail(500, { errorAi: "Datenbankfehler beim Anwenden der KI-Struktur." });
        }
    }
};