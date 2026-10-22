import { error, fail, redirect } from '@sveltejs/kit';
import {
    projectsEnabled, listProjects, getProject, getProjectBookings, createProject,
    updateProject, setProjectStatus, deleteProject, moveBooking
} from '$lib/server/projects.js';
import { summarizeProject, selectableProjects, parseBudget } from '$lib/projects.js';

const MAX_SHOWN_BOOKINGS = 300;

export async function load({ params, locals }) {
    const systemId = locals.systemId;
    if (!systemId) throw error(401, 'Kein aktives Lager ausgewählt');
    if (!(await projectsEnabled(systemId))) throw redirect(303, '/projekte');

    const project = await getProject(systemId, params.id);
    if (!project) throw error(404, 'Dieses Projekt wurde nicht gefunden.');

    const [projects, bookings] = await Promise.all([listProjects(systemId), getProjectBookings(systemId, project)]);
    return {
        project,
        parent: project.parentId ? projects.find((p) => p.id === project.parentId) || null : null,
        summary: summarizeProject(project, projects, bookings),
        bookings: bookings.slice(0, MAX_SHOWN_BOOKINGS),
        allBookings: bookings.length > MAX_SHOWN_BOOKINGS ? bookings : null,
        moveTargets: selectableProjects(projects)
    };
}

// Gemeinsame Prüfung aller Aktionen: Funktion aktiv und Projekt gehört zum Lager
async function context(locals, params) {
    if (!locals.systemId || !(await projectsEnabled(locals.systemId))) return { failure: fail(403, { error: 'Die Funktion „Projekte“ ist ausgeschaltet.' }) };
    const project = await getProject(locals.systemId, params.id);
    if (!project) return { failure: fail(404, { error: 'Projekt nicht gefunden.' }) };
    return { project, systemId: locals.systemId };
}

function readFields(data) {
    const values = { name: data.get('name')?.toString() || '', description: data.get('description')?.toString() || '' };
    const { budget, error: budgetError } = parseBudget(data.get('budget'));
    return { values, budget, budgetError };
}

export const actions = {
    update: async ({ request, locals, params }) => {
        const { failure, project, systemId } = await context(locals, params);
        if (failure) return failure;
        const { values, budget, budgetError } = readFields(await request.formData());
        if (budgetError) return fail(400, { action: 'update', error: budgetError });
        const result = await updateProject(systemId, project.id, { ...values, budget });
        return result.error ? fail(400, { action: 'update', error: result.error }) : { action: 'update', ok: true };
    },

    createSub: async ({ request, locals, params }) => {
        const { failure, project, systemId } = await context(locals, params);
        if (failure) return failure;
        const { values, budget, budgetError } = readFields(await request.formData());
        if (budgetError) return fail(400, { action: 'createSub', error: budgetError, values });
        const result = await createProject(systemId, { ...values, budget, parentId: project.id }, locals.user?.id);
        return result.error ? fail(400, { action: 'createSub', error: result.error, values }) : { action: 'createSub', ok: true };
    },

    status: async ({ request, locals, params }) => {
        const { failure, project, systemId } = await context(locals, params);
        if (failure) return failure;
        const status = (await request.formData()).get('status') === 'active' ? 'active' : 'closed';
        const result = await setProjectStatus(systemId, project.id, status);
        return result.error ? fail(400, { action: 'status', error: result.error }) : { action: 'status', ok: true };
    },

    delete: async ({ locals, params }) => {
        const { failure, project, systemId } = await context(locals, params);
        if (failure) return failure;
        const result = await deleteProject(systemId, project.id);
        if (result.error) return fail(400, { action: 'delete', error: result.error });
        throw redirect(303, result.parentId ? `/projekte/${result.parentId}` : '/projekte');
    },

    move: async ({ request, locals, params }) => {
        const { failure, systemId } = await context(locals, params);
        if (failure) return failure;
        const data = await request.formData();
        const result = await moveBooking(systemId, data.get('bookingId')?.toString(), data.get('targetProjectId')?.toString());
        return result.error ? fail(400, { action: 'move', error: result.error }) : { action: 'move', ok: true };
    }
};
