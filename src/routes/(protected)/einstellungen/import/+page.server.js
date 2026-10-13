import { fail, error } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import db from '$lib/server/db.js';
import { actor } from '$lib/server/actor.js';
import { canAccessPath } from '$lib/permissions.js';
import { validateImportRows, MAX_IMPORT_ROWS } from '$lib/articleCsv.js';

const canManageCategories = (locals) => canAccessPath('/einstellungen/category', locals.allowedRoutes || []);

async function existingGtins(systemId) {
    return (await db.getArticles(systemId)).map((a) => a.gtin).filter(Boolean);
}

export async function load({ locals }) {
    if (!locals.systemId) throw error(401, 'Kein aktives Lager ausgewählt');
    const [categories, gtins] = await Promise.all([db.getCategories(locals.systemId), existingGtins(locals.systemId)]);
    return {
        categories: JSON.parse(JSON.stringify(categories)),
        existingGtins: gtins,
        canManageCategories: canManageCategories(locals),
        maxRows: MAX_IMPORT_ROWS
    };
}

export const actions = {
    import: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { error: 'Kein aktives Lager ausgewählt.' });

        const data = await request.formData();
        let rows;
        try {
            rows = JSON.parse(data.get('rows') || '[]');
            if (!Array.isArray(rows) || rows.length === 0) throw new Error();
        } catch {
            return fail(400, { error: 'Keine gültigen Zeilen erhalten.' });
        }
        // Neue Kategorien nur mit dem Recht "Kategorien verwalten"
        const allowNewCategories = data.get('createCategories') === 'true' && canManageCategories(locals);

        // Auf dem Server erneut prüfen – die Vorschau im Browser ist nur eine Hilfe
        let categories = await db.getCategories(systemId);
        const checked = validateImportRows(rows, categories, { allowNewCategories, existingGtins: await existingGtins(systemId) });
        const importable = checked.filter((r) => r.errors.length === 0 && !r.skipped);

        let created = 0;
        const failed = [];
        for (const row of importable) {
            try {
                let { mainCategoryId, subcategoryId } = row.data;
                if (!subcategoryId) {
                    // Fehlende Kategorie anlegen (gleichnamige werden wiederverwendet)
                    categories = await db.getCategories(systemId);
                    const norm = (s) => s.trim().toLowerCase();
                    let main = categories.find((c) => norm(c.name) === norm(row.data.mainCategoryName));
                    if (!main) main = { _id: await db.createMainCategory(systemId, row.data.mainCategoryName.slice(0, 60)), subcategories: [] };
                    const sub = (main.subcategories || []).find((s) => norm(s.name) === norm(row.data.subcategoryName));
                    mainCategoryId = main._id;
                    subcategoryId = sub ? sub.id : (await db.createSubcategory(systemId, main._id, row.data.subcategoryName.slice(0, 60))).id;
                }
                await db.createArticle(systemId, {
                    title: row.data.title,
                    description: row.data.description,
                    mainCategoryId: new ObjectId(mainCategoryId),
                    subcategoryId,
                    gtin: row.data.gtin,
                    istBestand: row.data.istBestand,
                    sollBestand: row.data.sollBestand,
                    mindestBestand: row.data.mindestBestand,
                    supplier: row.data.supplier,
                    price: row.data.price ?? 0,
                    orderLink: row.data.orderLink,
                    images: [],
                    imagePath: null,
                    attributes: {},
                    createdAt: new Date(),
                    updatedAt: new Date()
                }, actor(locals, 'import'));
                created++;
            } catch (err) {
                console.error('CSV-Import: Zeile fehlgeschlagen', row.line, err);
                failed.push(row.line);
            }
        }

        return {
            imported: created,
            skipped: checked.filter((r) => r.skipped).length,
            invalid: checked.filter((r) => r.errors.length > 0).length,
            failed
        };
    }
};
