import db from '$lib/server/db.js';
import { redirect } from '@sveltejs/kit';

export async function load({ locals }) { // NEU: locals statt cookies
    const systemId = locals.systemId;
    if (!systemId) throw redirect(303, '/login');

    let shelves = [];
    try {
        // Abfrage für das spezifische System
        shelves = await db.getShelves(systemId) || [];
    } catch (e) {
        console.error("Fehler beim Laden der Regale:", e);
    }

    let nextFreeLedIndex = 0;
    if (shelves.length > 0) {
        const lastShelf = shelves[shelves.length - 1];
        nextFreeLedIndex = parseInt(lastShelf.start_index) + parseInt(lastShelf.drawer_count);
    }

    return {
        shelves: JSON.parse(JSON.stringify(shelves)),
        nextFreeLedIndex
    };
}

export const actions = {
    triggerCalibrationLED: async ({ request, locals }) => { // NEU: locals
        const systemId = locals.systemId;
        if (!systemId) return { success: false };

        const data = await request.formData();
        const ledIndex = parseInt(data.get('ledIndex'));
        
        await db.createHardwareCommand(systemId, ledIndex + 1);
        return { success: true };
    },

    // Bricht den Vorgang ab und schaltet das Licht aus
    cancelCalibration: async ({ locals }) => { // NEU: locals
        const systemId = locals.systemId;
        if (!systemId) return { success: false };

        // Die 0 sagt dem Python-Skript: "Alles ausschalten & abbrechen"
        await db.createHardwareCommand(systemId, 0); 
        return { success: true };
    },

    saveNewShelf: async ({ request, locals }) => { // NEU: locals
        const systemId = locals.systemId;
        if (!systemId) return { success: false };

        const data = await request.formData();
        const shelfName = data.get('shelfName');
        const startIndex = parseInt(data.get('startIndex'));
        const drawerCount = parseInt(data.get('drawerCount'));
        const barcodes = JSON.parse(data.get('barcodes')); 

        try {
            await db.createNewShelf(systemId, shelfName, startIndex, drawerCount, barcodes);
            
            // Auch nach erfolgreichem Speichern das Licht ausmachen
            await db.createHardwareCommand(systemId, 0); 
            
            return { success: true };
        } catch (err) {
            console.error("🔴 Fehler beim Speichern des Regals:", err);
            return { success: false };
        }
    },
    updateBarcode: async ({ request, locals }) => { // NEU: locals
        const systemId = locals.systemId;
        if (!systemId) return { success: false };

        const data = await request.formData();
        const shelfId = data.get('shelfId');
        const ledIndex = parseInt(data.get('ledIndex'));
        const newBarcode = data.get('newBarcode');

        try {
            // 1. Datenbank aktualisieren
            await db.updateDrawerBarcode(systemId, shelfId, ledIndex, newBarcode);
            
            // 2. Hardware ausschalten
            await db.createHardwareCommand(systemId, 0); 
            
            return { success: true };
        } catch (err) {
            console.error("🔴 Fehler beim Ändern des Barcodes:", err);
            return { success: false };
        }
    },
    deleteShelf: async ({ request, locals }) => { // NEU: locals
        const systemId = locals.systemId;
        if (!systemId) return { success: false };

        const data = await request.formData();
        const shelfId = data.get('shelfId');

        try {
            await db.deleteShelf(systemId, shelfId);
            
            // Zur Sicherheit Hardware ausschalten
            await db.createHardwareCommand(systemId, 0); 
            
            return { success: true };
        } catch (err) {
            console.error("🔴 Fehler beim Löschen des Regals:", err);
            return { success: false };
        }
    }
};