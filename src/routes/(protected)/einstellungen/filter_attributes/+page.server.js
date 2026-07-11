import { fail, error } from '@sveltejs/kit';
import db from '$lib/server/db.js'; 

export async function load({ locals }) { // NEU: locals statt cookies
    // 1. Aktives Lager identifizieren
    const systemId = locals.systemId;
    if (!systemId) {
        throw error(401, 'Kein aktives Lager ausgewählt');
    }

    // 2. Nur die Attribute dieses Lagers laden
    const attributeLibrary = await db.getFilterAttributes(systemId);
    
    // POJO-Fix für die sichere Übertragung an SvelteKit
    return { 
        attributeLibrary: JSON.parse(JSON.stringify(attributeLibrary)) 
    };
}

export const actions = {
    // 1. Neues Attribut erstellen
    create: async ({ request, locals }) => { // NEU: locals statt cookies
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { errorCreate: "Kein aktives Lager ausgewählt." });

        const data = await request.formData();
        const label = data.get('label');
        const ui_type = data.get('ui_type');
        const unit = data.get('unit');
        const is_multiple = data.get('is_multiple') === 'true';
        
        const optionsRaw = data.get('options') || "";
        const options = optionsRaw.split(',')
            .map(opt => opt.trim())
            .filter(opt => opt !== "");

        if (!label || !ui_type) {
            return fail(400, { errorCreate: "Anzeigename und Eingabetyp sind Pflichtfelder." });
        }

        try {
            await db.createFilterAttribute(systemId, {
                label,
                ui_type,
                unit: unit || null,
                is_multiple: ui_type === 'select' ? is_multiple : false,
                options: ui_type === 'select' ? options : []
            });
            return { success: true };
        } catch (err) {
            console.error("Fehler beim Erstellen:", err);
            return fail(500, { errorCreate: "Datenbankfehler beim Erstellen." });
        }
    },

    // 2. Bestehendes Attribut komplett aktualisieren
    update: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { errorUpdate: "Kein aktives Lager ausgewählt." });

        const data = await request.formData();
        const id = data.get('id'); 
        const label = data.get('label');
        const ui_type = data.get('ui_type');
        const unit = data.get('unit');
        const is_multiple = data.get('is_multiple') === 'true';
        
        const optionsRaw = data.get('options') || "";
        const options = optionsRaw.split(',')
            .map(opt => opt.trim())
            .filter(opt => opt !== "");

        if (!id || !label || !ui_type) {
            return fail(400, { errorUpdate: "Wichtige Felder fehlen." });
        }

        try {
            await db.updateFilterAttribute(systemId, id, {
                label,
                ui_type,
                unit: unit || null,
                is_multiple: ui_type === 'select' ? is_multiple : false,
                options: ui_type === 'select' ? options : []
            });
            return { successUpdate: true };
        } catch (err) {
            console.error("Fehler beim Aktualisieren:", err);
            return fail(500, { errorUpdate: "Datenbankfehler beim Aktualisieren." });
        }
    },

    // 3. Einen einzelnen Wert (Option) schnell hinzufügen
    addOptionQuick: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { errorQuick: "Kein aktives Lager ausgewählt." });

        const data = await request.formData();
        const id = data.get('id');
        const newOption = data.get('newOption');

        if (!id || !newOption) {
            return fail(400, { errorQuick: "Daten fehlen." });
        }

        try {
            await db.addOptionToFilterAttribute(systemId, id, newOption.trim());
            return { successQuickAdd: true };
        } catch (err) {
            console.error("Fehler beim Hinzufügen der Option:", err);
            return fail(500, { errorQuick: "Datenbankfehler." });
        }
    },

    // 4. Einen einzelnen Wert (Option) schnell löschen
    removeOptionQuick: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { errorQuick: "Kein aktives Lager ausgewählt." });

        const data = await request.formData();
        const id = data.get('id');
        const option = data.get('option');

        if (!id || !option) {
            return fail(400, { errorQuick: "Daten fehlen." });
        }

        try {
            await db.removeOptionFromFilterAttribute(systemId, id, option);
            return { successQuickRemove: true };
        } catch (err) {
            console.error("Fehler beim Löschen der Option:", err);
            return fail(500, { errorQuick: "Datenbankfehler." });
        }
    },

    // 5. Ein komplettes Attribut löschen
    delete: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { errorDelete: "Kein aktives Lager ausgewählt." });

        const data = await request.formData();
        const id = data.get('id');

        if (!id) {
            return fail(400, { errorDelete: "Attribut-ID fehlt." });
        }

        try {
            await db.deleteFilterAttribute(systemId, id);
            return { success: true };
        } catch (err) {
            console.error("Fehler beim Löschen des Attributs:", err);
            return fail(500, { errorDelete: "Datenbankfehler beim Löschen." });
        }
    }
};