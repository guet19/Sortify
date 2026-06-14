import db from '$lib/server/db.js';
import { fail } from '@sveltejs/kit';

export async function load({ cookies }) {
    const userId = cookies.get('session');
    const user = await db.getUserById(userId);

    // Datum für das HTML <input type="date"> richtig formatieren (YYYY-MM-DD)
    let formattedDate = "";
    if (user.birthDate) {
        const d = new Date(user.birthDate);
        formattedDate = d.toISOString().split('T')[0];
    }

    return {
        profileData: {
            firstName: user.firstName,
            lastName: user.lastName,
            country: user.country,
            birthDate: formattedDate,
            email: user.email
        }
    };
}

export const actions = {
    default: async ({ request, cookies }) => {
        const userId = cookies.get('session');
        const data = await request.formData();

        // Neue Daten aus dem Formular ziehen
        const updateData = {
            firstName: data.get('firstName')?.toString().trim() || "",
            lastName: data.get('lastName')?.toString().trim() || "",
            country: data.get('country')?.toString().trim() || "",
            birthDate: data.get('birthDate') ? new Date(data.get('birthDate')) : null,
            updatedAt: new Date()
        };

        try {
            await db.updateUser(userId, updateData);
            return { success: true, message: "Profil erfolgreich aktualisiert." };
        } catch (e) {
            console.error("Fehler beim Profil-Update:", e);
            return fail(500, { error: "Fehler beim Speichern der Daten." });
        }
    }
};