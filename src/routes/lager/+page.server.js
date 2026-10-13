import { redirect } from '@sveltejs/kit';
import { getSystemsOverview, createSystemAction, deleteSystemAction } from '$lib/server/systems.js';

export async function load({ locals }) {
    if (!locals.user) throw redirect(303, '/login?redirectTo=%2Flager');

    const overview = await getSystemsOverview(locals.user.id, locals.userSystems || []);
    return {
        ...overview,
        activeSystemId: locals.systemId || null
    };
}

export const actions = {
    // Eigenes, neues Lager anlegen – der Ersteller wird Administrator
    createSystem: createSystemAction,

    // Lager endgültig löschen (nur Ersteller, mit Namensbestätigung)
    deleteSystem: deleteSystemAction
};
