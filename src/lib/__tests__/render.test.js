// Rendert wichtige Seiten serverseitig mit Beispieldaten. Fängt Laufzeitfehler im Template ab
// (z.B. eine nicht definierte Variable), die der Build allein nicht bemerkt.
import { describe, it, expect, vi } from 'vitest';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';

vi.mock('$app/stores', () => ({
    page: readable({ url: new URL('http://localhost/'), params: {}, data: { activeSystemId: 'sys1', allowedRoutes: ['*'] } })
}));
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock('$app/navigation', () => ({ beforeNavigate: () => {}, invalidateAll: async () => {}, goto: async () => {} }));
vi.mock('$app/environment', () => ({ browser: false, dev: true }));

const article = {
    _id: 'a1', title: 'Spanplattenschraube 4 x 40', description: 'Torx', istBestand: 10, sollBestand: 30, mindestBestand: 5,
    price: 0.25, mainCategoryId: 'c1', subcategoryId: 's1', attributes: {}, images: [], assigned_barcodes: [{ barcode: 'A-05', stock: 10 }]
};
const categories = [{ _id: 'c1', name: 'Schrauben', subcategories: [{ id: 's1', name: 'Holzschrauben', allowed_attributes: [] }] }];
const movements = [
    { id: 'm1', before: 12, after: 10, delta: -2, source: 'terminal-rueckgabe', userName: 'Test', projectName: 'Autoentwicklung › Räder', createdAt: new Date().toISOString() },
    { id: 'm2', before: 10, after: 12, delta: 2, source: 'unbekannte-quelle', userName: '', projectName: null, createdAt: new Date().toISOString() }
];

describe('Seiten rendern ohne Laufzeitfehler', () => {
    it('Artikelseite mit Bestandsverlauf und Projekten', async () => {
        const { default: ArticleDetail } = await import('../components/ArticleDetail.svelte');
        const data = { article, categories, attributes: [], movements, userColor: '#3b82f6', projectsEnabled: true, projectOptions: [{ id: 'p1', label: 'Autoentwicklung', name: 'Autoentwicklung', parentName: null }] };
        const { body } = render(ArticleDetail, { props: { data } });
        expect(body).toContain('Bestandsverlauf');
        expect(body).toContain('Rückgabe am Terminal');
        expect(body).toContain('Autoentwicklung › Räder');
    });

    it('Artikelansicht im Terminal', async () => {
        const { default: ArticleDetail } = await import('../components/ArticleDetail.svelte');
        const { body } = render(ArticleDetail, { props: { data: { article, categories, attributes: [], movements }, terminal: true } });
        expect(body).toContain('Zurück zur Suche');
    });

    it('Projektliste und Projektdetail', async () => {
        const { default: List } = await import('../../routes/(protected)/projekte/+page.svelte');
        const { default: Detail } = await import('../../routes/(protected)/projekte/[id]/+page.svelte');
        const { summarizeProject } = await import('../projects.js');
        const projects = [
            { id: 'p1', name: 'Autoentwicklung', description: 'Prototyp', parentId: null, status: 'active', budget: 1, closedAt: null },
            { id: 'p2', name: 'Räder', description: '', parentId: 'p1', status: 'active', budget: null, closedAt: null }
        ];
        const bookings = [{ id: 'b1', projectId: 'p2', rootProjectId: 'p1', projectName: 'Autoentwicklung › Räder', articleId: 'a1', articleTitle: 'Schraube', quantity: 8, unitPrice: 0.25, total: 2, source: 'terminal-rueckgabe', userName: 'Test', createdAt: new Date().toISOString() }];

        const list = render(List, { props: { data: { enabled: true, projects, totals: { p1: { total: 2, count: 1, lastAt: null } } }, form: null } });
        expect(list.body).toContain('Autoentwicklung');

        const detail = render(Detail, { props: { form: null, data: {
            project: projects[0], parent: null, summary: summarizeProject(projects[0], projects, bookings),
            bookings, allBookings: null, moveTargets: [{ id: 'p1', label: 'Autoentwicklung' }]
        } } });
        expect(detail.body).toContain('Kosten gesamt');
        expect(detail.body).toContain('überschritten');
    });
});
