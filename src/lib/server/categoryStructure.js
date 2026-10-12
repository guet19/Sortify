import db from '$lib/server/db.js';

const normalize = (s) => String(s || '').trim().toLowerCase();

// Legt die vom KI-Assistenten geplante Struktur an (Kategorieseite & Artikel anlegen):
// Haupt- und Unterkategorie (bestehend oder neu) sowie bestehende und neue Filter.
// Gleichnamige Kategorien/Filter werden wiederverwendet statt doppelt angelegt.
// Rückgabe: { mainId, subId } oder { error, status }
export async function applyCategoryStructure(systemId, data) {
    const mainMode = data.get('mainMode')?.toString();
    const subMode = data.get('subMode')?.toString();
    const newMainName = data.get('newMainName')?.toString().trim().slice(0, 60) || '';
    const newSubName = data.get('newSubName')?.toString().trim().slice(0, 60) || '';
    const mainIdInput = data.get('existingMainId')?.toString() || '';
    const subIdInput = data.get('existingSubId')?.toString() || '';

    let existingAttributes, newAttributes;
    try {
        existingAttributes = JSON.parse(data.get('existingAttributes') || '[]');
        newAttributes = JSON.parse(data.get('newAttributes') || '[]');
        if (!Array.isArray(existingAttributes) || !Array.isArray(newAttributes)) throw new Error();
    } catch {
        return { error: 'Ungültige Filter-Daten.', status: 400 };
    }

    const [categories, attributes] = await Promise.all([
        db.getCategories(systemId),
        db.getFilterAttributes(systemId)
    ]);

    // 1. Hauptkategorie
    let mainCat;
    if (mainMode === 'new') {
        if (!newMainName) return { error: 'Bitte einen Namen für die Hauptkategorie eingeben.', status: 400 };
        mainCat = categories.find(c => normalize(c.name) === normalize(newMainName));
        if (!mainCat) {
            const createdId = await db.createMainCategory(systemId, newMainName);
            mainCat = { _id: createdId, name: newMainName, subcategories: [] };
        }
    } else {
        mainCat = categories.find(c => c._id === mainIdInput);
    }
    if (!mainCat) return { error: 'Hauptkategorie konnte nicht ermittelt werden.', status: 400 };

    // 2. Unterkategorie (muss zur Hauptkategorie gehören)
    let subCat;
    if (subMode === 'new') {
        if (!newSubName) return { error: 'Bitte einen Namen für die Unterkategorie eingeben.', status: 400 };
        subCat = (mainCat.subcategories || []).find(s => normalize(s.name) === normalize(newSubName));
        if (!subCat) {
            const subResult = await db.createSubcategory(systemId, mainCat._id, newSubName);
            subCat = { id: subResult?.id, allowed_attributes: [] };
        }
    } else {
        subCat = (mainCat.subcategories || []).find(s => s.id === subIdInput);
    }
    if (!subCat?.id) return { error: 'Unterkategorie konnte nicht ermittelt werden.', status: 400 };

    // 3. Filter: nur echte bestehende IDs; neue nur anlegen, wenn der Name noch nicht existiert
    const validIds = new Set(attributes.map(a => a._id));
    const finalAllowedAttributes = existingAttributes.filter(id => validIds.has(id));

    for (const attr of newAttributes.slice(0, 10)) {
        const label = String(attr?.label || '').trim().slice(0, 60);
        if (!label) continue;

        const existing = attributes.find(a => normalize(a.label) === normalize(label));
        if (existing) {
            finalAllowedAttributes.push(existing._id);
            continue;
        }

        const ui_type = ['select', 'number', 'text'].includes(attr.ui_type) ? attr.ui_type : 'select';
        const result = await db.createFilterAttribute(systemId, {
            label,
            ui_type,
            unit: ui_type === 'number' ? String(attr.unit || '').trim().slice(0, 15) : '',
            options: ui_type === 'select' && Array.isArray(attr.options)
                ? [...new Set(attr.options.map(o => String(o).trim().slice(0, 60)).filter(Boolean))].slice(0, 50)
                : [],
            is_multiple: false
        });
        if (result?.insertedId) {
            const newId = result.insertedId.toString();
            finalAllowedAttributes.push(newId);
            attributes.push({ _id: newId, label }); // verhindert Dubletten innerhalb derselben Anfrage
        }
    }

    // 4. Alle Filter (bestehende + neu erstellte) der Unterkategorie zuweisen
    if (finalAllowedAttributes.length > 0) {
        const mergedAttributes = [...new Set([...(subCat.allowed_attributes || []), ...finalAllowedAttributes])];
        await db.updateSubcategoryAttributes(systemId, mainCat._id, subCat.id, mergedAttributes);
    }

    return { mainId: mainCat._id, subId: subCat.id };
}
