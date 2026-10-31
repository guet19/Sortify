import db from '$lib/server/db.js';
import { redirect, fail } from '@sveltejs/kit';
import { listTerminals } from '$lib/server/devices.js';
import { defaultTerminalId, shelfTerminalId } from '$lib/terminals.js';

// Mehrere Terminals: Für welches Terminal (LED-Streifen) gilt ein LED-Befehl dieser Seite?
// shelfId = bestehendes Regal (dessen Terminal), terminalId = neues Regal am gewählten Terminal
async function ledTerminal(systemId, data) {
    const terminals = await listTerminals(systemId);
    if (terminals.length === 0) return null;
    const shelfId = data.get('shelfId')?.toString();
    if (shelfId) {
        const shelf = (await db.getShelves(systemId)).find((s) => s._id === shelfId);
        if (shelf) return shelfTerminalId(shelf, terminals);
    }
    const wanted = data.get('terminalId')?.toString();
    return terminals.some((t) => t.id === wanted) ? wanted : defaultTerminalId(terminals);
}

export async function load({ locals }) { 
    const systemId = locals.systemId;
    if (!systemId) throw redirect(303, '/login');

    let shelves = [];
    try {
        shelves = await db.getShelves(systemId) || [];
    } catch (e) {
        console.error("Fehler beim Laden der Regale:", e);
    }

    // Die nächste freie LED rechnet die Seite pro Terminal selbst aus ($lib/terminals.js, nextFreeLed)
    return {
        shelves: JSON.parse(JSON.stringify(shelves))
    };
}

export const actions = {
    triggerCalibrationLED: async ({ request, locals }) => { 
        const systemId = locals.systemId;
        if (!systemId) return { success: false };

        const data = await request.formData();
        const ledIndex = parseInt(data.get('ledIndex'));
        const deviceId = await ledTerminal(systemId, data);
        
        // 🔥 FIX 1: Zuerst IMMER alle LEDs ausschalten (als Array [0]!) – nur am betroffenen Terminal
        await db.createHardwareCommand(systemId, [0], null, { deviceId });
        
        // Ein Wimpernschlag Pause, damit der Pi die Befehle sauber nacheinander liest
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 🔥 FIX 2: Dann die neue LED einschalten (ebenfalls als Array!)
        await db.createHardwareCommand(systemId, [ledIndex + 1], null, { deviceId });
        
        return { success: true };
    },

    cancelCalibration: async ({ request, locals }) => { 
        const systemId = locals.systemId;
        if (!systemId) return { success: false };

        // 🔥 FIX: [0] statt 0 – nur am Terminal, an dem gerade angelernt wird
        const deviceId = await ledTerminal(systemId, await request.formData());
        await db.createHardwareCommand(systemId, [0], null, { deviceId }); 
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
        // Das Regal hängt am LED-Streifen des gewählten Terminals
        const deviceId = await ledTerminal(systemId, data);

        try {
            await db.createNewShelf(systemId, shelfName, startIndex, drawerCount, barcodes, deviceId);
            
            // 🔥 FIX: [0] statt 0
            await db.createHardwareCommand(systemId, [0], null, { deviceId }); 
            
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
    // Mehrere Terminals: Regal an den LED-Streifen eines anderen Terminals hängen
    setShelfTerminal: async ({ request, locals }) => {
        const systemId = locals.systemId;
        if (!systemId) return fail(401, { error: 'Kein Lager ausgewählt' });
        const data = await request.formData();
        const shelfId = data.get('shelfId')?.toString();
        const terminalId = data.get('terminalId')?.toString();
        const terminals = await listTerminals(systemId);
        if (!terminals.some((t) => t.id === terminalId)) return fail(400, { error: 'Terminal nicht gefunden.' });
        if (!shelfId || !(await db.setShelfTerminal(systemId, shelfId, terminalId))) return fail(404, { error: 'Regal nicht gefunden.' });
        return { success: true };
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