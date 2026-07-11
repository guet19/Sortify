import { error, fail } from '@sveltejs/kit';
import db from '$lib/server/db.js'; // WICHTIG: Als Default-Import ohne geschweifte Klammern!
import { ObjectId } from 'mongodb';
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

export async function load({ locals }) { // NEU: locals statt cookies
    // 1. System-ID aus dem Rucksack (locals) holen
    const systemId = locals.systemId;
    
    if (!systemId) {
        throw error(401, 'Kein aktives Lager ausgewählt');
    }

    try {
        // 2. Kategorien und Attribute für genau dieses Lager laden
        const categories = await db.getCategories(systemId);
        const attributes = await db.getFilterAttributes(systemId);

        // JSON.parse(JSON.stringify) ist der ultimative Schutz gegen POJO-Fehler
        return {
            categories: JSON.parse(JSON.stringify(categories)),
            attributes: JSON.parse(JSON.stringify(attributes))
        };
    } catch (e) {
        console.error("--- LOAD FEHLER DIAGNOSE ---");
        console.error("Meldung:", e.message);
        throw error(500, `Fehler beim Laden der Formulardaten: ${e.message}`);
    }
}

export const actions = {
    default: async ({ request, locals }) => { // NEU: locals statt cookies
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

        if (!title || !mainCategoryId || istBestandRaw === null || istBestandRaw === '') {
            return fail(400, { error: "Titel, Hauptkategorie und Ist-Bestand sind erforderlich." });
        }

        try {
            const istBestand = parseInt(istBestandRaw, 10);
            const sollBestand = data.get('sollBestand') ? parseInt(data.get('sollBestand'), 10) : null;
            const mindestBestand = data.get('mindestBestand') ? parseInt(data.get('mindestBestand'), 10) : null;

            let imagePath = null;

            // Stream-Upload zu Cloudinary
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
                orderLink: data.get('orderLink'),
                imagePath, 
                attributes: itemAttributes,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            // 3. Artikel mit der neuen systemId in der Datenbank anlegen
            await db.createArticle(systemId, newArticle);

            return { success: true, message: "Artikel erfolgreich gespeichert!" };
            
        } catch (e) {
            console.error("🚨 SPEICHERFEHLER:", e.message);
            return fail(500, { error: `Serverfehler beim Speichern: ${e.message}` });
        }
    }
};