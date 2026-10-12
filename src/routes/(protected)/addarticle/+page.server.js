import { error, fail } from '@sveltejs/kit';
import db from '$lib/server/db.js'; // WICHTIG: Als Default-Import ohne geschweifte Klammern!
import { ObjectId } from 'mongodb';
import { safeHttpUrl } from '$lib/server/security.js';
import { canAccessPath } from '$lib/permissions.js';
import { v2 as cloudinary } from 'cloudinary';
import { 
    CLOUDINARY_CLOUD_NAME, 
    CLOUDINARY_API_KEY, 
    CLOUDINARY_API_SECRET 
} from '$env/static/private';

// Cloudinary Konfiguration
cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET
});

// 🔥 WICHTIG: Hier "url" hinzugefügt, um den ?copy= Parameter und das Bookmarklet lesen zu können
export async function load({ locals, url }) { 
    // 1. System-ID aus dem Rucksack (locals) holen
    const systemId = locals.systemId;
    
    if (!systemId) {
        throw error(401, 'Kein aktives Lager ausgewählt');
    }

    try {
        // 2. Kategorien und Attribute für genau dieses Lager laden
        // Unabhängige Abfragen parallel statt nacheinander
        const [categories, attributes] = await Promise.all([
            db.getCategories(systemId),
            db.getFilterAttributes(systemId)
        ]);

        // Kopier-Logik
        const copyId = url.searchParams.get('copy');
        let copiedArticle = null;
        
        if (copyId) {
            try {
                copiedArticle = await db.getArticleById(systemId, copyId);
                // WICHTIG: Die _id des alten Artikels löschen, damit es beim Speichern kein Update, sondern ein NEUER Artikel wird!
                if (copiedArticle) {
                    delete copiedArticle._id;
                }
            } catch (copyErr) {
                console.error("Fehler beim Laden des zu kopierenden Artikels:", copyErr.message);
            }
        }

        // 🔥 NEU: Bookmarklet-Daten aus der URL auslesen
        const bookmarkletData = {
            title: url.searchParams.get('title') || '',
            url: url.searchParams.get('url') || '',
            img: url.searchParams.get('img') || '',
            desc: url.searchParams.get('desc') || ''
        };

        // JSON.parse(JSON.stringify) ist der ultimative Schutz gegen POJO-Fehler
        return {
            categories: JSON.parse(JSON.stringify(categories)),
            attributes: JSON.parse(JSON.stringify(attributes)),
            copiedArticle: copiedArticle ? JSON.parse(JSON.stringify(copiedArticle)) : null,
            // 🔥 Diese Daten reichen wir jetzt ans Frontend weiter
            bookmarkletData,
            // Darf der Nutzer per KI neue Kategorien & Filter anlegen?
            canManageCategories: canAccessPath('/einstellungen/category', locals.allowedRoutes || [])
        };
    } catch (e) {
        console.error("Fehler beim Laden der Formulardaten:", e);
        throw error(500, 'Fehler beim Laden der Formulardaten.');
    }
}

export const actions = {
    default: async ({ request, locals }) => { 
        // 1. System-ID aus locals holen
        const systemId = locals.systemId;
        
        if (!systemId) {
            return fail(401, { error: 'Nicht autorisiert oder kein Lager ausgewählt. Bitte neu anmelden.' });
        }

        const data = await request.formData();
        
        const title = data.get('title');
        const mainCategoryId = data.get('mainCategoryId');
        const istBestandRaw = data.get('istBestand');
        
        const imageFile = data.get('image'); 
        const externalImageUrl = safeHttpUrl(data.get('externalImageUrl')); // Link vom Bookmarklet (nur http/https)

        if (!title || !mainCategoryId || istBestandRaw === null || istBestandRaw === '') {
            return fail(400, { error: "Titel, Hauptkategorie und Ist-Bestand sind erforderlich." });
        }
        if (title.toString().length > 200) {
            return fail(400, { error: "Der Titel darf maximal 200 Zeichen lang sein." });
        }
        if (!ObjectId.isValid(mainCategoryId.toString())) {
            return fail(400, { error: "Ungültige Hauptkategorie." });
        }

        try {
            const istBestand = parseInt(istBestandRaw, 10);
            const sollBestand = data.get('sollBestand') ? parseInt(data.get('sollBestand'), 10) : null;
            const mindestBestand = data.get('mindestBestand') ? parseInt(data.get('mindestBestand'), 10) : null;

            // 🔥 Standardmäßig nutzen wir den Link vom Bookmarklet (falls vorhanden)
            let imagePath = externalImageUrl || null;

            // Stream-Upload zu Cloudinary (überschreibt imagePath, wenn eine Datei hochgeladen wurde)
            if (imageFile && imageFile instanceof Blob && imageFile.size > 0) {
                const arrayBuffer = await imageFile.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                
                const uploadResult = await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        { 
                            folder: 'storify_uploads',
                            allowed_formats: ['jpg', 'png', 'webp'] 
                        },
                        (error, result) => {
                            if (error) return reject(error);
                            resolve(result);
                        }
                    );
                    uploadStream.end(buffer);
                });

                imagePath = uploadResult.secure_url;
            }

            const itemAttributes = {};
            for (const [key, value] of data.entries()) {
                if (key.startsWith('attr_') && value) {
                    const attrId = key.replace('attr_', '');
                    itemAttributes[attrId] = value;
                }
            }

            const newArticle = {
                title,
                description: data.get('description'),
                mainCategoryId: new ObjectId(mainCategoryId),
                subcategoryId: data.get('subcategoryId') || null,
                gtin: data.get('gtin') || "",
                istBestand,
                sollBestand,
                mindestBestand,
                supplier: data.get('supplier'),
                price: parseFloat(data.get('price') || "0"),
                orderLink: safeHttpUrl(data.get('orderLink')),
                imagePath, // Hier liegt jetzt entweder der Shop-Link oder der Cloudinary-Link drin
                attributes: itemAttributes,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            // 3. Artikel mit der neuen systemId in der Datenbank anlegen
            await db.createArticle(systemId, newArticle);

            return { success: true, message: "Artikel erfolgreich gespeichert!" };
            
        } catch (e) {
            console.error("🚨 SPEICHERFEHLER:", e);
            return fail(500, { error: 'Serverfehler beim Speichern. Bitte versuche es erneut.' });
        }
    }
};