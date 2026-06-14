import db from '$lib/server/db.js';
import { error, redirect, fail } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import { v2 as cloudinary } from 'cloudinary';
import { 
    CLOUDINARY_CLOUD_NAME, 
    CLOUDINARY_API_KEY, 
    CLOUDINARY_API_SECRET 
} from '$env/static/private';

// Cloudinary konfigurieren
cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET
});

export async function load({ params, cookies }) {
    const userId = cookies.get('session');
    if (!userId) {
        throw error(401, 'Nicht autorisiert');
    }

    const articleId = params.id;
    const article = await db.getArticleById(userId, articleId);

    if (!article) {
        throw error(404, { message: 'Dieser Artikel wurde nicht gefunden oder du hast keinen Zugriff darauf.' });
    }

    const categories = await db.getCategories(userId);
    const attributes = await db.getFilterAttributes(userId);

    return {
        article, // (SvelteKit-Tipp: Wenn db.js saubere Strings liefert, brauchst du hier kein JSON.parse mehr)
        categories,
        attributes
    };
}

export const actions = {
    update: async ({ request, params, cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return fail(401, { error: "Nicht autorisiert" });

        const formData = await request.formData();
        const articleId = params.id;
        
        const oldArticle = await db.getArticleById(userId, articleId);
        if (!oldArticle) {
            return fail(403, { error: "Artikel nicht gefunden oder Zugriff verweigert." });
        }

        // --- DATEN AUFBEREITEN ---
        let updateData = {
            title: formData.get("title")?.toString().trim() || "",
            description: formData.get("description")?.toString().trim() || "",
            // WICHTIG: Die Kategorie-ID muss wieder eine ObjectId werden!
            mainCategoryId: formData.get("mainCategoryId") ? new ObjectId(formData.get("mainCategoryId").toString()) : null,
            subcategoryId: formData.get("subcategoryId")?.toString() || "",
            supplier: formData.get("supplier")?.toString().trim() || "",
            gtin: formData.get("gtin")?.toString().trim() || "",
            orderLink: formData.get("orderLink")?.toString().trim() || "",
            updatedAt: new Date()
        };

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

        // --- BILDVERARBEITUNG (Cloudinary) ---
        let finalImagePath = oldArticle.imagePath; // Standardmäßig das alte Bild behalten
        
        const removeExistingImage = formData.get("removeExistingImage") === "true";
        const newImageFile = formData.get("image");

        // 1. Wenn Nutzer das Bild explizit löscht
        if (removeExistingImage) {
            finalImagePath = null;
        }

        // 2. Wenn ein neues Bild hochgeladen wird (Stream zu Cloudinary)
        if (newImageFile && newImageFile instanceof Blob && newImageFile.size > 0) {
            const arrayBuffer = await newImageFile.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            const uploadResult = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { folder: 'storify_uploads', allowed_formats: ['jpg', 'png', 'webp'] },
                    (error, result) => {
                        if (error) return reject(error);
                        resolve(result);
                    }
                );
                uploadStream.end(buffer);
            });
            
            finalImagePath = uploadResult.secure_url;
        }

        updateData.imagePath = finalImagePath;

        // --- UPDATE IN DATENBANK ---
        try {
            await db.updateArticle(userId, articleId, updateData);
            return { success: true };
        } catch (err) {
            console.error("Datenbank Update-Fehler:", err);
            return fail(500, { error: "Fehler beim Speichern der Änderungen in der Datenbank." });
        }
    },

    delete: async ({ params, cookies }) => {
        const userId = cookies.get('session');
        if (!userId) return fail(401, { error: "Nicht autorisiert" });

        const articleId = params.id;
        
        const oldArticle = await db.getArticleById(userId, articleId);
        if (!oldArticle) {
            return fail(403, { error: "Artikel nicht gefunden oder Zugriff verweigert." });
        }

        // HINWEIS: Wir löschen das Bild hier nicht mehr physisch per fs.unlinkSync.
        // Das Bild bleibt vorerst als "Waisenkind" auf Cloudinary liegen. 
        // Für eine kostenlose App reicht das völlig aus, da Cloudinary großzügige Limits hat.

        try {
            await db.deleteArticle(userId, articleId); 
        } catch (err) {
            console.error("Fehler beim Löschen des Artikels:", err);
            return fail(500, { error: "Fehler beim Löschen." });
        }

        throw redirect(303, "/");
    }
};