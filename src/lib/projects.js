// Projekte & Kosten – reine Hilfsfunktionen (Browser und Server).
// Ein Projekt hat höchstens eine Ebene Unterprojekte: "Autoentwicklung" › "Räder".
// Buchungen: { projectId, rootProjectId, articleId, articleTitle, quantity, unitPrice, total }
//   quantity > 0 = Verbrauch (Entnahme), quantity < 0 = Rückbuchung ins Lager

export const MAX_PROJECT_NAME = 80;
export const MAX_PROJECT_DESCRIPTION = 2000;

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const formatChf = (n) =>
    (Number(n) || 0).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const byName = (a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' });

// Hauptprojekte mit ihren Unterprojekten, alphabetisch
export function buildProjectTree(projects) {
    const mains = projects.filter((p) => !p.parentId).sort(byName);
    return mains.map((main) => ({
        ...main,
        children: projects.filter((p) => p.parentId === main.id).sort(byName)
    }));
}

// Projekte, auf die gebucht werden darf: aktiv und (bei Unterprojekten) mit aktivem Hauptprojekt
export function selectableProjects(projects) {
    const options = [];
    for (const main of buildProjectTree(projects)) {
        if (main.status !== 'active') continue;
        options.push({ id: main.id, name: main.name, label: main.name, parentName: null });
        for (const child of main.children) {
            if (child.status !== 'active') continue;
            options.push({ id: child.id, name: child.name, label: `${main.name} › ${child.name}`, parentName: main.name });
        }
    }
    return options;
}

// "Autoentwicklung › Räder"
export function projectLabel(project, projects) {
    if (!project) return '';
    const parent = project.parentId ? projects.find((p) => p.id === project.parentId) : null;
    return parent ? `${parent.name} › ${project.name}` : project.name;
}

function addTo(target, booking) {
    target.count = (target.count || 0) + 1;
    target.quantity = round2(target.quantity + (Number(booking.quantity) || 0));
    target.total = round2(target.total + (Number(booking.total) || 0));
}

// Kostenübersicht eines Projekts: Summe, Aufteilung auf Unterprojekte und Materialliste.
// Bei einem Hauptprojekt zählen die Buchungen aller Unterprojekte mit.
export function summarizeProject(project, projects, bookings) {
    const children = project.parentId ? [] : projects.filter((p) => p.parentId === project.id).sort(byName);
    const ids = new Set([project.id, ...children.map((c) => c.id)]);
    const relevant = bookings.filter((b) => ids.has(b.projectId));

    const summary = {
        total: 0,
        quantity: 0,
        bookingCount: relevant.length,
        withoutPrice: 0,
        direct: { total: 0, quantity: 0, count: 0 },
        children: children.map((c) => ({ id: c.id, name: c.name, status: c.status, budget: c.budget ?? null, total: 0, quantity: 0, count: 0 })),
        materials: []
    };

    const materials = new Map();
    for (const b of relevant) {
        addTo(summary, b);
        if (b.unitPrice === null || b.unitPrice === undefined || Number(b.unitPrice) === 0) summary.withoutPrice++;

        if (b.projectId === project.id) addTo(summary.direct, b);
        else addTo(summary.children.find((c) => c.id === b.projectId), b);

        const key = b.articleId || b.articleTitle;
        if (!materials.has(key)) materials.set(key, { articleId: b.articleId, title: b.articleTitle, quantity: 0, total: 0, count: 0 });
        addTo(materials.get(key), b);
    }
    summary.materials = [...materials.values()]
        .filter((m) => m.quantity !== 0 || m.total !== 0)
        .sort((a, b) => b.total - a.total || a.title.localeCompare(b.title, 'de'));
    return summary;
}

// Budget-Anzeige: Anteil in Prozent (für den Balken auf 100 begrenzt) und Überschreitung
export function budgetState(total, budget) {
    const b = Number(budget);
    if (!Number.isFinite(b) || b <= 0) return null;
    const percent = Math.round((total / b) * 100);
    return { percent, bar: Math.min(100, Math.max(0, percent)), over: total > b, remaining: round2(b - total) };
}

// Budget aus einem Formularfeld: leer = kein Budget
export function parseBudget(value) {
    const text = String(value ?? '').trim().replace(/['\s]/g, '').replace(',', '.');
    if (!text) return { budget: null };
    const n = Number(text);
    if (!Number.isFinite(n) || n < 0 || n > 1e9) return { error: 'Bitte ein gültiges Budget in CHF eingeben.' };
    return { budget: round2(n) };
}
