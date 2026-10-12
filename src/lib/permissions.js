// Zentrale Berechtigungslogik – wird vom Server-Hook UND vom Menü genutzt,
// damit Anzeige und tatsächlicher Zugriff immer übereinstimmen.

// Diese Bereiche sind sensibel und werden NICHT automatisch über eine
// übergeordnete Berechtigung freigegeben (z.B. gibt '/terminal' keinen Zugriff auf die Hardware-Einstellungen).
const SEPARATELY_GRANTED = ['/terminal/settings'];

// API-Endpunkte erben die Berechtigung der Seiten, die sie benutzen
const API_PERMISSIONS = {
    '/api/scale/calibrate': ['/terminal/settings/calibration'],
    '/api/scale': ['/terminal/return', '/terminal/settings/scale', '/terminal/settings/assign', '/terminal/settings/maintenance'],
    '/api/fetch-image': ['/addarticle', '/editarticle'],
    '/api/extract-article': ['/addarticle', '/editarticle'],
    '/api/suggest-category': ['/addarticle'],
    '/api/ai-category-wizard': ['/einstellungen/category'],
    '/api/apply-category-structure': ['/einstellungen/category'],
    '/api/ai-status': ['/addarticle', '/einstellungen/category'],
    '/api/pairing-status': ['/terminal/settings/pairing']
};

// Liegt "path" in "route"? Nur an Segmentgrenzen ('/terminal' deckt nicht '/terminalxyz' ab)
function isWithin(path, route) {
    return path === route || path.startsWith(route.endsWith('/') ? route : route + '/');
}

function routeGrants(route, path) {
    if (route === '/') return path === '/';
    if (!isWithin(path, route)) return false;

    // Gesperrte Unterbereiche nur freigeben, wenn die Berechtigung selbst darin liegt
    return !SEPARATELY_GRANTED.some(area => isWithin(path, area) && !isWithin(route, area));
}

export function canAccessPath(path, allowedRoutes = []) {
    if (allowedRoutes.includes('*')) return true;

    // API-Routen: Zugriff, wenn eine der zugehörigen Seiten erlaubt ist
    const apiKey = Object.keys(API_PERMISSIONS)
        .sort((a, b) => b.length - a.length)
        .find(prefix => isWithin(path, prefix));
    if (apiKey) {
        return API_PERMISSIONS[apiKey].some(page => canAccessPath(page, allowedRoutes));
    }

    // Übersichtsseite eines gesperrten Bereichs (z.B. Terminal-Einstellungen mit Logout-Button):
    // erlaubt mit Zugriff auf den übergeordneten Bereich oder einen Unterpunkt.
    // Die Seite zeigt selbst nur die freigegebenen Kacheln an.
    if (SEPARATELY_GRANTED.includes(path) && allowedRoutes.some(r => r !== '/' && (isWithin(r, path) || isWithin(path, r)))) {
        return true;
    }

    return allowedRoutes.some(route => routeGrants(route, path));
}
