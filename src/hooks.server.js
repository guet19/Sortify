import db from '$lib/server/db.js';
import { redirect, error } from '@sveltejs/kit';

export async function handle({ event, resolve }) {
    const userId = event.cookies.get('session'); 
    const path = event.url.pathname;
    
    // Fallback: Falls das systemId Cookie fehlt, nutzen wir wieder die Test-ID
    const systemId = event.cookies.get('systemId') || "6a4ea775e94b7120d470bea7";

    let user = null;

    // 1. ZOMBIE-COOKIE FILTER (Prüft, ob der Cookie-User überhaupt noch existiert)
    if (userId) {
        user = await db.getUserById(userId);
        if (!user) {
            event.cookies.delete('session', { path: '/' });
            event.cookies.delete('systemId', { path: '/' });
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
        '/profil'
    ];
    if (systemIndependentRoutes.some(route => path.startsWith(route))) {
        if (systemId) event.locals.systemId = systemId;
        return await resolve(event);
    }

    // 7. RBAC BERECHTIGUNGEN PRÜFEN
    if (!user.systems) {
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
        return await resolve(event);
    }

    const systemRoles = await db.getSystemRoles(systemId);
    const roleDefinition = systemRoles.find(r => r.roleId === systemContext.role);

    if (!roleDefinition || !roleDefinition.allowedRoutes) {
        throw error(403, 'Keine Berechtigungen für dieses System hinterlegt.');
    }

    // Individuelle Startseite prüfen und priorisieren
    if (path === '/') {
        if (roleDefinition.startPage && roleDefinition.startPage !== '/') {
            throw redirect(303, roleDefinition.startPage);
        }
    }

    const allowed = roleDefinition.allowedRoutes;
    
    // Vollzugriff ('*') direkt erlauben
    if (allowed.includes('*')) {
        return await resolve(event);
    }

    const hasAccess = allowed.some(route => {
        if (route === '/') return path === '/'; 
        return path.startsWith(route);          
    });

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