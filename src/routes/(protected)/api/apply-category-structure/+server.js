import { json } from '@sveltejs/kit';
import { applyCategoryStructure } from '$lib/server/categoryStructure.js';

// Legt die vom KI-Assistenten empfohlene Kategorie-Struktur beim Artikel-Anlegen an.
// Zugriff nur mit dem Recht "Kategorien verwalten" (siehe $lib/permissions.js).
export async function POST({ request, locals }) {
    if (!locals.systemId) return json({ error: 'Kein aktives Lager ausgewählt.' }, { status: 401 });
    try {
        const result = await applyCategoryStructure(locals.systemId, await request.formData());
        if (result.error) return json({ error: result.error }, { status: result.status });
        return json(result);
    } catch (err) {
        console.error("Fehler beim Anlegen der Kategorie-Struktur:", err);
        return json({ error: 'Datenbankfehler beim Anlegen der Kategorie.' }, { status: 500 });
    }
}
