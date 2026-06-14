import { fail, error } from '@sveltejs/kit';
import db from '$lib/server/db.js';

export async function load({ cookies }) {
    // 1. Nutzer identifizieren
    const userId = cookies.get('session');
    if (!userId) {
        throw error(401, 'Nicht autorisiert');
    }

    // 2. Alle Datenabfragen streng auf den Nutzer filtern
    const [categories, filterAttributes, articles] = await Promise.all([
        db.getCategories(userId),
        db.getFilterAttributes(userId),
        db.getArticles(userId)
    ]);
    
    return {
        categories,
        filterAttributes,
        articles
    };
}

export const actions = {
    createMain: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return fail(401, { errorMain: "Nicht autorisiert." });

        const data = await request.formData();
        const name = data.get('name');
        if (!name) return fail(400, { errorMain: "Bitte einen Namen eingeben." });

        try {
            const newId = await db.createMainCategory(userId, name.trim());
            return { successMain: true, newId: newId ? newId.toString() : null };
        } catch (err) {
            return fail(500, { errorMain: "Datenbankfehler beim Speichern." });
        }
    },

    createSub: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return fail(401, { errorSub: "Nicht autorisiert." });

        const data = await request.formData();
        const mainId = data.get('mainId');
        const subName = data.get('subName');
        if (!mainId || !subName) return fail(400, { errorSub: "Daten unvollständig." });

        try {
            await db.createSubcategory(userId, mainId, subName.trim());
            return { successSub: true };
        } catch (err) {
            return fail(500, { errorSub: "Datenbankfehler beim Speichern." });
        }
    },

    deleteSub: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return fail(401, { errorDelete: "Nicht autorisiert." });

        const data = await request.formData();
        const mainId = data.get('mainId');
        const subId = data.get('subId');
        if (!mainId || !subId) return fail(400, { errorDelete: "IDs fehlen." });

        try {
            await db.deleteSubcategory(userId, mainId, subId);
            return { successDelete: true };
        } catch (err) {
            return fail(500, { errorDelete: "Datenbankfehler beim Löschen." });
        }
    },

    deleteMain: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return fail(401, { errorDeleteMain: "Nicht autorisiert." });

        const data = await request.formData();
        const mainId = data.get('mainId');
        if (!mainId) return fail(400, { errorDeleteMain: "ID fehlt." });

        try {
            await db.deleteMainCategory(userId, mainId);
            return { successDeleteMain: true };
        } catch (err) {
            return fail(500, { errorDeleteMain: "Datenbankfehler beim Löschen." });
        }
    },

    bulkDeleteSubs: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return fail(401, { errorBulkDelete: "Nicht autorisiert." });

        const data = await request.formData();
        const mainId = data.get('mainId');
        const subIds = data.getAll('subIds');

        if (!mainId || !subIds || subIds.length === 0) {
            return fail(400, { errorBulkDelete: "Daten für Massenlöschung unvollständig." });
        }

        try {
            for (const subId of subIds) {
                await db.deleteSubcategory(userId, mainId, subId);
            }
            return { successBulkDelete: true };
        } catch (err) {
            return fail(500, { errorBulkDelete: "Fehler beim Massenlöschen." });
        }
    },

    updateAttributes: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return fail(401, { errorAttr: "Nicht autorisiert." });

        const data = await request.formData();
        const mainId = data.get('mainId');
        const subId = data.get('subId');
        const attributeIds = data.getAll('attributes');

        if (!mainId || !subId) return fail(400, { errorAttr: "IDs fehlen." });

        try {
            await db.updateSubcategoryAttributes(userId, mainId, subId, attributeIds);
            return { successAttr: true };
        } catch (err) {
            return fail(500, { errorAttr: "Fehler beim Zuweisen." });
        }
    },

    renameMain: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return fail(401, { errorRename: "Nicht autorisiert." });

        const data = await request.formData();
        const id = data.get('id');
        const newName = data.get('newName');
        if (!id || !newName) return fail(400, { errorRename: "Daten fehlen." });

        try {
            await db.renameMainCategory(userId, id, newName.trim());
            return { successRename: true };
        } catch (err) {
            return fail(500, { errorRename: "Fehler beim Umbenennen." });
        }
    },

    renameSub: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return fail(401, { errorRenameSub: "Nicht autorisiert." });

        const data = await request.formData();
        const mainId = data.get('mainId');
        const subId = data.get('subId');
        const newName = data.get('newName');

        if (!mainId || !subId || !newName) return fail(400, { errorRenameSub: "Daten fehlen." });

        try {
            await db.renameSubcategory(userId, mainId, subId, newName.trim());
            return { successRenameSub: true };
        } catch (err) {
            return fail(500, { errorRenameSub: "Fehler beim Umbenennen der Unterkategorie." });
        }
    }
};