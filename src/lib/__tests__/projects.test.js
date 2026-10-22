import { describe, it, expect } from 'vitest';
import { buildProjectTree, selectableProjects, projectLabel, summarizeProject, budgetState, parseBudget } from '../projects.js';

const projects = [
    { id: 'auto', name: 'Autoentwicklung', parentId: null, status: 'active' },
    { id: 'raeder', name: 'Räder', parentId: 'auto', status: 'active' },
    { id: 'motor', name: 'Motor', parentId: 'auto', status: 'closed' },
    { id: 'alt', name: 'Altes Projekt', parentId: null, status: 'closed' },
    { id: 'altsub', name: 'Teil', parentId: 'alt', status: 'active' }
];

const booking = (projectId, title, quantity, unitPrice) => ({
    projectId, articleId: title, articleTitle: title, quantity, unitPrice,
    total: Math.round(quantity * (unitPrice || 0) * 100) / 100
});

describe('Projekte', () => {
    it('baut Hauptprojekte mit Unterprojekten', () => {
        const tree = buildProjectTree(projects);
        expect(tree.map((p) => p.name)).toEqual(['Altes Projekt', 'Autoentwicklung']);
        expect(tree[1].children.map((c) => c.name)).toEqual(['Motor', 'Räder']);
    });

    it('bietet nur aktive Projekte mit aktivem Hauptprojekt zur Buchung an', () => {
        expect(selectableProjects(projects).map((p) => p.label)).toEqual(['Autoentwicklung', 'Autoentwicklung › Räder']);
    });

    it('beschriftet Unterprojekte mit dem Hauptprojekt', () => {
        expect(projectLabel(projects[1], projects)).toBe('Autoentwicklung › Räder');
        expect(projectLabel(projects[0], projects)).toBe('Autoentwicklung');
    });

    it('summiert Kosten gesamt, je Unterprojekt und je Artikel', () => {
        const bookings = [
            booking('raeder', 'Schraube M6', 20, 0.1),
            booking('raeder', 'Schraube M6', -5, 0.1),   // Rückbuchung
            booking('motor', 'Dichtung', 2, 3.5),
            booking('auto', 'Kabelbinder', 10, null),     // ohne Preis
            booking('alt', 'Fremd', 1, 99)                 // anderes Projekt
        ];
        const s = summarizeProject(projects[0], projects, bookings);
        expect(s.total).toBe(8.5);
        expect(s.bookingCount).toBe(4);
        expect(s.withoutPrice).toBe(1);
        expect(s.direct).toEqual({ total: 0, quantity: 10, count: 1 });
        expect(s.children.find((c) => c.id === 'raeder')).toMatchObject({ total: 1.5, quantity: 15, count: 2 });
        expect(s.children.find((c) => c.id === 'motor')).toMatchObject({ total: 7, quantity: 2 });
        expect(s.materials.map((m) => [m.title, m.quantity, m.total])).toEqual([
            ['Dichtung', 2, 7], ['Schraube M6', 15, 1.5], ['Kabelbinder', 10, 0]
        ]);
    });

    it('zeigt bei Unterprojekten nur deren eigene Buchungen', () => {
        const s = summarizeProject(projects[1], projects, [booking('raeder', 'Schraube', 4, 0.5), booking('auto', 'X', 1, 1)]);
        expect(s.total).toBe(2);
        expect(s.children).toEqual([]);
    });

    it('berechnet den Budget-Stand', () => {
        expect(budgetState(50, 200)).toEqual({ percent: 25, bar: 25, over: false, remaining: 150 });
        expect(budgetState(250, 200)).toMatchObject({ bar: 100, over: true, remaining: -50 });
        expect(budgetState(10, null)).toBeNull();
    });

    it('liest Budgets aus Formularfeldern', () => {
        expect(parseBudget('')).toEqual({ budget: null });
        expect(parseBudget("1'250,50")).toEqual({ budget: 1250.5 });
        expect(parseBudget('-3').error).toBeTruthy();
    });
});
