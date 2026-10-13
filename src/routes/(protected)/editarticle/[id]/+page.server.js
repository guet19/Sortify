import db from '$lib/server/db.js';
import { error, redirect, fail } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import { safeHttpUrl } from '$lib/server/security.js';
import { buildImageList, getArticleImages, deleteUnusedImages } from '$lib/server/articleImages.js';

export async function load({ params, locals }) { // NEU: locals statt cookies
    const systemId = locals.systemId;
    if (!systemId) {
        throw error(401, 'Kein aktives Lager ausgewählt');
    }

    const articleId = params.id;
    // WICHTIG: db-Abfrage mit systemId
    const article = await db.getArticleById(systemId, articleId);

    if (!article) {
        throw error(404, { message: 'Dieser Artikel wurde nicht gefunden oder gehört nicht zu diesem Lager.' });
    }

    // Unabhängige Abfragen parallel statt nacheinander
    const [categories, attributes] = await Promise.all([
        db.getCategories(systemId),
        db.getFilterAttributes(systemId)
    ]);

    // POJO Fix zur Sicherheit beibehalten, besonders wegen der "attributes" Map und Datumswerten
    return {
        article: JSON.parse(JSON.stringify(article)), 
        categories: JSON.parse(JSON.stringify(categories)),
        attributes: JSON.parse(JSON.stringify(attributes))
    };
}

export const actions = {
    update: async ({ request, params, locals }) => { // NEU: locals statt cookies
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { error: "Kein aktives Lager ausgewählt" });

        const formData = await request.formData();
        const articleId = params.id;
        
        const oldArticle = await db.getArticleById(systemId, articleId);
        if (!oldArticle) {
            return fail(403, { error: "Artikel nicht gefunden oder Zugriff verweigert." });
        }

        // --- DATEN AUFBEREITEN ---
        let updateData = {
            title: formData.get("title")?.toString().trim() || "",
            description: formData.get("description")?.toString().trim() || "",
            // WICHTIG: Die Kategorie-ID muss wieder eine ObjectId werden!
            mainCategoryId: ObjectId.isValid(formData.get("mainCategoryId")?.toString()) ? new ObjectId(formData.get("mainCategoryId").toString()) : null,
            subcategoryId: formData.get("subcategoryId")?.toString() || "",
            supplier: formData.get("supplier")?.toString().trim() || "",
            gtin: formData.get("gtin")?.toString().trim() || "",
            orderLink: safeHttpUrl(formData.get("orderLink")),
            updatedAt: new Date()
        };

        if (!updateData.title || updateData.title.length > 200) {
            return fail(400, { error: "Der Titel muss zwischen 1 und 200 Zeichen lang sein." });
        }

        const priceStr = formData.get("price");
        updateData.price = priceStr ? parseFloat(priceStr) : null;

        const istBestandStr = formData.get("istBestand");
        updateData.istBestand = istBestandStr ? parseInt(istBestandStr, 10) : 0;

        const sollBestandStr = formData.get("sollBestand");
        updateData.sollBestand = sollBestandStr ? parseInt(sollBestandStr, 10) : null;

        const mindestBestandStr = formData.get("mindestBestand");
        updateData.mindestBestand = mindestBestandStr ? parseInt(mindestBestandStr, 10) : null;

        const attributesMap = {};
        for (const [key, value] of formData.entries()) {
            if (key.startsWith("attr_")) {
                const attrId = key.replace("attr_", "");
                const allValues = formData.getAll(key);
                attributesMap[attrId] = allValues.length > 1 ? allValues : value.toString();
            }
        }
        updateData.attributes = attributesMap;

        // --- BILDER ---
        // Behalten werden nur Bilder, die schon zu diesem Artikel gehören; neue Zuschnitte werden hochgeladen
        try {
            updateData.images = await buildImageList(formData, { allowedKeep: getArticleImages(oldArticle) });
        } catch (imageError) {
            return fail(400, { error: imageError.message });
        }
        updateData.imagePath = updateData.images[0] || null;

        // --- UPDATE IN DATENBANK ---
        try {
            await db.updateArticle(systemId, articleId, updateData);

            // Entfernte Bilder bei Cloudinary löschen (sofern kein anderer Artikel sie nutzt)
            const removedImages = getArticleImages(oldArticle).filter(url => !updateData.images.includes(url));
            await deleteUnusedImages(removedImages, db.isImageInUse);

            return { success: true };
        } catch (err) {
            console.error("Datenbank Update-Fehler:", err);
            return fail(500, { error: "Fehler beim Speichern der Änderungen in der Datenbank." });
        }
    },

    delete: async ({ params, locals }) => { // NEU: locals statt cookies
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { error: "Kein aktives Lager ausgewählt" });

        const articleId = params.id;
        
        const oldArticle = await db.getArticleById(systemId, articleId);
        if (!oldArticle) {
            return fail(403, { error: "Artikel nicht gefunden oder Zugriff verweigert." });
        }

        try {
            await db.deleteArticle(systemId, articleId); 
            // Bilder des Artikels bei Cloudinary löschen (sofern kein anderer Artikel sie nutzt)
            await deleteUnusedImages(getArticleImages(oldArticle), db.isImageInUse);
        } catch (err) {
            console.error("Fehler beim Löschen des Artikels:", err);
            return fail(500, { error: "Fehler beim Löschen." });
        }

        throw redirect(303, "/");
    }
};