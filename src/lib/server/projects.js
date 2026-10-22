// Projekte & Kosten: Datenbankzugriffe. Rechenlogik und Anzeige-Helfer liegen in $lib/projects.js.
// Collections:
//   projects          { systemId, name, description, parentId, status: 'active'|'closed', budget, createdAt, createdBy, closedAt }
//   project_bookings  { systemId, projectId, rootProjectId, projectName, articleId, articleTitle, quantity, unitPrice, total, ... }
//                     (werden in db.js bei jeder Bestandsänderung mit Projekt angelegt)
import { ObjectId } from 'mongodb';
import db from '$lib/server/db.js';
import { escapeRegex } from '$lib/server/security.js';
import { MAX_PROJECT_NAME, MAX_PROJECT_DESCRIPTION, projectLabel } from '$lib/projects.js';

// Funktionen, die pro Lager zugeschaltet werden können
export const SYSTEM_FEATURES = ['projects'];

const collection = async (name) => (await db.getDb()).collection(name);
const oid = (id) => (ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : null);

function toPlain(p) {
    return {
        id: p._id.toString(),
        name: p.name,
        description: p.description || '',
        parentId: p.parentId ? p.parentId.toString() : null,
        status: p.status === 'closed' ? 'closed' : 'active',
        budget: typeof p.budget === 'number' ? p.budget : null,
        createdAt: p.createdAt?.toISOString() || null,
        closedAt: p.closedAt?.toISOString() || null
    };
}

// ---------- Funktion ein-/ausschalten ----------

export async function getSystemFeatures(systemId) {
    const id = oid(systemId);
    if (!id) return {};
    const system = await (await collection('systems')).findOne({ _id: id }, { projection: { features: 1 } });
    return system?.features || {};
}

export async function projectsEnabled(systemId) {
    return (await getSystemFeatures(systemId)).projects === true;
}

export async function setSystemFeature(systemId, feature, enabled) {
    if (!SYSTEM_FEATURES.includes(feature)) throw new Error('Unbekannte Funktion');
    await (await collection('systems')).updateOne({ _id: oid(systemId) }, { $set: { [`features.${feature}`]: !!enabled } });
}

// ---------- Projekte ----------

export async function listProjects(systemId) {
    const rows = await (await collection('projects')).find({ systemId: oid(systemId) }).toArray();
    return rows.map(toPlain);
}

export async function getProject(systemId, projectId) {
    const id = oid(projectId);
    if (!id) return null;
    const row = await (await collection('projects')).findOne({ _id: id, systemId: oid(systemId) });
    return row ? toPlain(row) : null;
}

function cleanFields({ name, description }) {
    const cleanName = String(name || '').trim().slice(0, MAX_PROJECT_NAME);
    if (!cleanName) return { error: 'Bitte einen Projektnamen eingeben.' };
    return { name: cleanName, description: String(description || '').trim().slice(0, MAX_PROJECT_DESCRIPTION) };
}

// parentId: Hauptprojekt, falls ein Unterprojekt angelegt wird (nur eine Ebene)
export async function createProject(systemId, { name, description, budget = null, parentId = null }, userId = null) {
    const fields = cleanFields({ name, description });
    if (fields.error) return { error: fields.error };

    let parent = null;
    if (parentId) {
        parent = await getProject(systemId, parentId);
        if (!parent || parent.parentId) return { error: 'Unterprojekte können nur in einem Hauptprojekt angelegt werden.' };
        if (parent.status !== 'active') return { error: 'Das Hauptprojekt ist abgeschlossen.' };
    }

    const projects = await collection('projects');
    const duplicate = await projects.findOne({
        systemId: oid(systemId),
        parentId: parent ? oid(parent.id) : null,
        name: { $regex: `^${escapeRegex(fields.name)}$`, $options: 'i' }
    });
    if (duplicate) return { error: `Es gibt bereits ein Projekt „${fields.name}“.` };

    const { insertedId } = await projects.insertOne({
        systemId: oid(systemId),
        ...fields,
        parentId: parent ? oid(parent.id) : null,
        status: 'active',
        budget,
        createdBy: oid(userId),
        createdAt: new Date(),
        closedAt: null
    });
    return { id: insertedId.toString() };
}

export async function updateProject(systemId, projectId, { name, description, budget }) {
    const fields = cleanFields({ name, description });
    if (fields.error) return { error: fields.error };
    const result = await (await collection('projects')).updateOne(
        { _id: oid(projectId), systemId: oid(systemId) },
        { $set: { ...fields, budget } }
    );
    if (!result.matchedCount) return { error: 'Projekt nicht gefunden.' };
    // Gespeicherten Namen in den Buchungen nachführen (für Bestandsverlauf und Exporte)
    await refreshBookingLabels(systemId);
    return { ok: true };
}

async function refreshBookingLabels(systemId) {
    const projects = await listProjects(systemId);
    const bookings = await collection('project_bookings');
    await Promise.all(projects.map((p) =>
        bookings.updateMany({ systemId: oid(systemId), projectId: oid(p.id) }, { $set: { projectName: projectLabel(p, projects) } })
    ));
}

// Abschliessen: Auf das Projekt (und bei Hauptprojekten auf alle Unterprojekte) kann nicht mehr gebucht werden
export async function setProjectStatus(systemId, projectId, status) {
    const project = await getProject(systemId, projectId);
    if (!project) return { error: 'Projekt nicht gefunden.' };
    const active = status === 'active';
    if (active && project.parentId) {
        const parent = await getProject(systemId, project.parentId);
        if (parent?.status !== 'active') return { error: 'Bitte zuerst das Hauptprojekt wieder öffnen.' };
    }
    await (await collection('projects')).updateOne(
        { _id: oid(projectId), systemId: oid(systemId) },
        { $set: { status: active ? 'active' : 'closed', closedAt: active ? null : new Date() } }
    );
    return { ok: true };
}

// Löschen nur ohne Buchungen – sonst gingen Kosten verloren (stattdessen abschliessen)
export async function deleteProject(systemId, projectId) {
    const project = await getProject(systemId, projectId);
    if (!project) return { error: 'Projekt nicht gefunden.' };
    const projects = await collection('projects');
    const children = project.parentId ? [] : await projects.find({ systemId: oid(systemId), parentId: oid(project.id) }).toArray();
    const ids = [oid(project.id), ...children.map((c) => c._id)];

    const bookingCount = await (await collection('project_bookings')).countDocuments({ systemId: oid(systemId), projectId: { $in: ids } });
    if (bookingCount > 0) {
        return { error: `Das Projekt hat ${bookingCount} Buchung(en) und kann nicht gelöscht werden. Schliesse es stattdessen ab.` };
    }
    await projects.deleteMany({ systemId: oid(systemId), _id: { $in: ids } });
    return { ok: true, parentId: project.parentId };
}

// Prüft ein vom Browser übermitteltes Projekt für eine Buchung: gehört zum Lager und ist offen
export async function resolveBookingProject(systemId, projectId) {
    const project = await getProject(systemId, projectId);
    if (!project || project.status !== 'active') return null;
    let parent = null;
    if (project.parentId) {
        parent = await getProject(systemId, project.parentId);
        if (!parent || parent.status !== 'active') return null;
    }
    return {
        id: project.id,
        rootId: parent ? parent.id : project.id,
        label: parent ? `${parent.name} › ${project.name}` : project.name
    };
}

// ---------- Buchungen ----------

function bookingToPlain(b) {
    return {
        id: b._id.toString(),
        projectId: b.projectId.toString(),
        rootProjectId: b.rootProjectId.toString(),
        projectName: b.projectName || '',
        articleId: b.articleId ? b.articleId.toString() : null,
        articleTitle: b.articleTitle || '',
        quantity: b.quantity,
        unitPrice: b.unitPrice ?? null,
        total: b.total || 0,
        source: b.source || '',
        userName: b.userName || '',
        createdAt: b.createdAt.toISOString()
    };
}

// Alle Buchungen eines Hauptprojekts inkl. Unterprojekte (bzw. eines Unterprojekts)
export async function getProjectBookings(systemId, project) {
    const filter = project.parentId
        ? { systemId: oid(systemId), projectId: oid(project.id) }
        : { systemId: oid(systemId), rootProjectId: oid(project.id) };
    const rows = await (await collection('project_bookings')).find(filter).sort({ createdAt: -1 }).limit(5000).toArray();
    return rows.map(bookingToPlain);
}

// Summen je Hauptprojekt für die Projektliste
export async function getProjectTotals(systemId) {
    const rows = await (await collection('project_bookings')).aggregate([
        { $match: { systemId: oid(systemId) } },
        { $group: { _id: '$rootProjectId', total: { $sum: '$total' }, count: { $sum: 1 }, lastAt: { $max: '$createdAt' } } }
    ]).toArray();
    return Object.fromEntries(rows.map((r) => [r._id.toString(), {
        total: Math.round(r.total * 100) / 100, count: r.count, lastAt: r.lastAt?.toISOString() || null
    }]));
}

// Falsch zugeordnete Entnahme auf ein anderes (offenes) Projekt umbuchen
export async function moveBooking(systemId, bookingId, targetProjectId) {
    const target = await resolveBookingProject(systemId, targetProjectId);
    if (!target) return { error: 'Zielprojekt nicht gefunden oder abgeschlossen.' };
    const result = await (await collection('project_bookings')).updateOne(
        { _id: oid(bookingId), systemId: oid(systemId) },
        { $set: { projectId: oid(target.id), rootProjectId: oid(target.rootId), projectName: target.label, movedAt: new Date() } }
    );
    return result.matchedCount ? { ok: true } : { error: 'Buchung nicht gefunden.' };
}
