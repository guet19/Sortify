import { fail, error } from '@sveltejs/kit';
import db from '$lib/server/db.js';

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
        const attributeIds = data.getAll('attributes');

        if (!mainId || !subId) return fail(400, { errorAttr: "IDs fehlen." });

        try {
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
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { errorAi: "Kein aktives Lager ausgewählt." });

        const data = await request.formData();
        const mainMode = data.get('mainMode'); 
        let mainId = data.get('existingMainId');
        const newMainName = data.get('newMainName');

        const subMode = data.get('subMode'); 
        let subId = data.get('existingSubId');
        const newSubName = data.get('newSubName');

        const existingAttributes = JSON.parse(data.get('existingAttributes') || '[]');
        const newAttributes = JSON.parse(data.get('newAttributes') || '[]');

        try {
            // 1. Hauptkategorie behandeln
            if (mainMode === 'new' && newMainName) {
                mainId = await db.createMainCategory(systemId, newMainName.trim()); 
            }

            if (!mainId) return fail(400, { errorAi: "Hauptkategorie konnte nicht ermittelt werden." });

            // 2. Unterkategorie behandeln
            if (subMode === 'new' && newSubName) {
                // Holt das Objekt mit { id: '...' } zurück (falls du die db.js wie zuvor besprochen angepasst hast)
                const subResult = await db.createSubcategory(systemId, mainId, newSubName.trim());
                subId = subResult?.id || subResult; 
            }

            if (!subId) return fail(400, { errorAi: "Unterkategorie konnte nicht ermittelt werden." });

            // 3. Komplett neue Filterattribute in der Datenbank anlegen
            let finalAllowedAttributes = [...existingAttributes];

            for (const attr of newAttributes) {
                const result = await db.createFilterAttribute(systemId, {
                    label: attr.label,
                    ui_type: attr.ui_type || "select",
                    unit: attr.unit || "",
                    options: attr.options || [],
                    is_multiple: false
                });
                
                if (result && result.insertedId) {
                    finalAllowedAttributes.push(result.insertedId.toString());
                }
            }

            // 4. Alle Attribute (bestehende + neu erstellte) der Unterkategorie zuweisen
            if (finalAllowedAttributes.length > 0) {
                const categories = await db.getCategories(systemId);
                const mainCat = categories.find(c => c._id.toString() === mainId.toString());
                const subCat = mainCat?.subcategories?.find(s => s.id.toString() === subId.toString());

                const currentAllowed = subCat?.allowed_attributes || [];
                const mergedAttributes = [...new Set([...currentAllowed, ...finalAllowedAttributes])];

                await db.updateSubcategoryAttributes(systemId, mainId, subId, mergedAttributes);
            }

            return { success: true };
        } catch (err) {
            console.error("Fehler bei applyAiStructure:", err);
            return fail(500, { errorAi: "Datenbankfehler beim Anwenden der KI-Struktur." });
        }
    }
};