import db from '$lib/server/db.js';
import { redirect, error } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { dev } from '$app/environment';
import { canAccessPath } from '$lib/permissions.js';
import { safeRedirect } from '$lib/server/security.js';

// Zusätzliche Sicherheits-Header für jede Antwort (CSP kommt aus svelte.config.js)
async function securityHeaders({ event, resolve }) {
    const response = await resolve(event);
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (!dev) {
        response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    return response;
}

async function authHandle({ event, resolve }) {
    const sessionToken = event.cookies.get('session');
    const path = event.url.pathname;

    // Ohne Cookie gibt es kein aktives Lager -> /select-system übernimmt
    const systemId = event.cookies.get('systemId') || null;

    let user = null;

    // 1. SESSION PRÜFEN (Cookie enthält ein Zufalls-Token, in der DB liegt nur dessen Hash)
    if (sessionToken) {
        const session = await db.getSession(sessionToken);
        if (session) {
            user = await db.getUserById(session.userId.toString());
        }
        if (!user) {
            event.cookies.delete('session', { path: '/' });
            event.cookies.delete('systemId', { path: '/' });
        } else {
            event.locals.sessionToken = sessionToken;
            // Mitgliedschaften für Lager-Dropdown & Lagerverwaltung (spart erneutes Laden des Users)
            event.locals.userSystems = user.systems || [];
        }
    }

    // 2. DER PASSWORT-ZWANG FIX
    if (user && user.mustChangePassword) {
        if (!path.startsWith('/profil') && !path.startsWith('/logout')) {
            throw redirect(303, '/profil'); 
        }
    }

    // 3. ÖFFENTLICHE ROUTEN (Ohne Login für jeden zugänglich)
    const publicRoutes = [
        '/login', 
        '/register', 
        '/forgot-password', 
        '/reset-password', 
        '/verify', 
        '/verify-email', 
        '/verify-password'
    ]; 
    if (publicRoutes.some(route => path.startsWith(route))) {
        if (user) {
            event.locals.user = {
                id: user._id.toString(),
                username: user.username || null,
                firstName: user.firstName || null,
                lastName: user.lastName || null,
                email: user.email || null,
                mustChangePassword: user.mustChangePassword
            };
            if (systemId) event.locals.systemId = systemId;
            if (user.systems && systemId) {
                const sysCtx = user.systems.find(s => s.systemId.toString() === systemId);
                if (sysCtx) {
                    event.locals.role = sysCtx.role;
                    // 🔥 NEU: Farbe aus dem Kontext laden
                    event.locals.color = sysCtx.color || '#3b82f6';
                }
            }
        }
        return await resolve(event);
    }

    // 4. NICHT EINGELOGGT? -> AB ZUM LOGIN
    if (!user) {
        throw redirect(303, '/login');
    }

    // 5. USER-DATEN FÜR DIE SVELTE-SEITEN BEREITSTELLEN
    event.locals.user = {
        id: user._id.toString(),
        username: user.username || null,
        firstName: user.firstName || null,
        lastName: user.lastName || null,
        email: user.email || null,
        mustChangePassword: user.mustChangePassword
    };

    // 6. SYSTEM-UNABHÄNGIGE ROUTEN (Login nötig, aber keine Rolle/Berechtigung)
    const systemIndependentRoutes = [
        '/select-system', 
        '/logout', 
        '/tools', 
        '/profil',
        '/lager'
    ];
    if (systemIndependentRoutes.some(route => path.startsWith(route))) {
        if (systemId) event.locals.systemId = systemId;
        return await resolve(event);
    }

    // 7. RBAC BERECHTIGUNGEN PRÜFEN
    if (!user.systems || !systemId) {
        throw redirect(303, '/select-system');
    }

    const systemContext = user.systems.find(s => s.systemId.toString() === systemId);
    
    if (!systemContext) {
        event.cookies.delete('systemId', { path: '/' });
        throw redirect(303, '/select-system');
    }

    event.locals.systemId = systemId;
    event.locals.role = systemContext.role; 
    // 🔥 NEU: Farbe in die locals laden (inkl. Fallback-Blau für alte Accounts ohne Farbe)
    event.locals.color = systemContext.color || '#3b82f6';

    // Administratoren dürfen alles
    if (systemContext.role === 'admin') {
        event.locals.allowedRoutes = ['*'];
        return await resolve(event);
    }

    const systemRoles = await db.getSystemRoles(systemId);
    const roleDefinition = systemRoles.find(r => r.roleId === systemContext.role);

    if (!roleDefinition || !roleDefinition.allowedRoutes) {
        throw error(403, 'Keine Berechtigungen für dieses System hinterlegt.');
    }

    const allowed = roleDefinition.allowedRoutes;
    // Für +layout.server.js merken, damit die Rollen nicht ein zweites Mal geladen werden
    event.locals.allowedRoutes = allowed;

    // Individuelle Startseite prüfen und priorisieren
    if (path === '/') {
        if (roleDefinition.startPage && roleDefinition.startPage !== '/') {
            throw redirect(303, safeRedirect(roleDefinition.startPage));
        }
    }

    const hasAccess = canAccessPath(path, allowed);

    if (!hasAccess) {
        // Intelligente Weiterleitung, falls der User direkt auf '/' landet (und keine startPage definiert war)
        if (path === '/') {
            // 1. Prio: Hat er Zugriff auf IRGENDEINEN Terminal-Bereich? Dann auf die Hauptseite /terminal
            const hasTerminalAccess = allowed.some(r => r.startsWith('/terminal'));
            if (hasTerminalAccess) {
                throw redirect(303, '/terminal');
            }
            
            // 2. Prio: Eine andere Seite. Wir sortieren nach Länge, um den "höchsten" Ordner zu finden
            if (allowed.length > 0) {
                const sortedRoutes = [...allowed].sort((a, b) => a.length - b.length);
                throw redirect(303, sortedRoutes[0]);
            }
        }

        // Für alle anderen Seiten greift weiterhin der strikte 403-Schutz
        throw error(403, 'Zugriff verweigert: Deine Rolle hat für diesen Bereich keine Berechtigung.');
    }

    return await resolve(event);
}

export const handle = sequence(securityHeaders, authHandle);
