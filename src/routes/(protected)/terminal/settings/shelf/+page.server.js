import db from '$lib/server/db.js';
import { redirect } from '@sveltejs/kit';

export async function load({ locals }) { 
    const systemId = locals.systemId;
    if (!systemId) throw redirect(303, '/login');

    let shelves = [];
    try {
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
    triggerCalibrationLED: async ({ request, locals }) => { 
        const systemId = locals.systemId;
        if (!systemId) return { success: false };

        const data = await request.formData();
        const ledIndex = parseInt(data.get('ledIndex'));
        
        // 🔥 FIX 1: Zuerst IMMER alle LEDs ausschalten (als Array [0]!)
        await db.createHardwareCommand(systemId, [0]);
        
        // Ein Wimpernschlag Pause, damit der Pi die Befehle sauber nacheinander liest
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 🔥 FIX 2: Dann die neue LED einschalten (ebenfalls als Array!)
        await db.createHardwareCommand(systemId, [ledIndex + 1]);
        
        return { success: true };
    },

    cancelCalibration: async ({ locals }) => { 
        const systemId = locals.systemId;
        if (!systemId) return { success: false };

        // 🔥 FIX: [0] statt 0
        await db.createHardwareCommand(systemId, [0]); 
        return { success: true };
    },

    saveNewShelf: async ({ request, locals }) => { 
        const systemId = locals.systemId;
        if (!systemId) return { success: false };

        const data = await request.formData();
        const shelfName = data.get('shelfName');
        const startIndex = parseInt(data.get('startIndex'));
        const drawerCount = parseInt(data.get('drawerCount'));
        const barcodes = JSON.parse(data.get('barcodes')); 

        try {
            await db.createNewShelf(systemId, shelfName, startIndex, drawerCount, barcodes);
            
            // 🔥 FIX: [0] statt 0
            await db.createHardwareCommand(systemId, [0]); 
            
            return { success: true };
        } catch (err) {
            console.error("🔴 Fehler beim Speichern des Regals:", err);
            return { success: false };
        }
    },
    updateBarcode: async ({ request, locals }) => { 
        const systemId = locals.systemId;
        if (!systemId) return { success: false };

        const data = await request.formData();
        const shelfId = data.get('shelfId');
        const ledIndex = parseInt(data.get('ledIndex'));
        const newBarcode = data.get('newBarcode');

        try {
            await db.updateDrawerBarcode(systemId, shelfId, ledIndex, newBarcode);
            
            // 🔥 FIX: [0] statt 0
            await db.createHardwareCommand(systemId, [0]); 
            
            return { success: true };
        } catch (err) {
            console.error("🔴 Fehler beim Ändern des Barcodes:", err);
            return { success: false };
        }
    },
    deleteShelf: async ({ request, locals }) => { 
        const systemId = locals.systemId;
        if (!systemId) return { success: false };

        const data = await request.formData();
        const shelfId = data.get('shelfId');

        try {
            await db.deleteShelf(systemId, shelfId);
            
            // 🔥 FIX: [0] statt 0
            await db.createHardwareCommand(systemId, [0]); 
            
            return { success: true };
        } catch (err) {
            console.error("🔴 Fehler beim Löschen des Regals:", err);
            return { success: false };
        }
    }
};