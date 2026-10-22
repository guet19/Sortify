import { error, fail, redirect } from '@sveltejs/kit';
import { projectsEnabled, listProjects, getProjectTotals, createProject } from '$lib/server/projects.js';
import { parseBudget } from '$lib/projects.js';

export async function load({ locals }) {
    if (!locals.systemId) throw error(401, 'Kein aktives Lager ausgewählt');
    if (!(await projectsEnabled(locals.systemId))) return { enabled: false };

    const [projects, totals] = await Promise.all([listProjects(locals.systemId), getProjectTotals(locals.systemId)]);
    return { enabled: true, projects, totals };
}

export const actions = {
    create: async ({ request, locals }) => {
        if (!locals.systemId || !(await projectsEnabled(locals.systemId))) return fail(403, { error: 'Die Funktion „Projekte“ ist ausgeschaltet.' });
        const data = await request.formData();
        const values = { name: data.get('name')?.toString() || '', description: data.get('description')?.toString() || '' };
        const { budget, error: budgetError } = parseBudget(data.get('budget'));
        if (budgetError) return fail(400, { error: budgetError, values });

        const result = await createProject(locals.systemId, { ...values, budget }, locals.user?.id);
        if (result.error) return fail(400, { error: result.error, values });
        throw redirect(303, `/projekte/${result.id}`);
    }
};
