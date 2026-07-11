export async function load({ cookies }) {
    const userId = cookies.get('session');
    if (!userId) {
        throw error(401, 'Nicht autorisiert');
    }

    const user = await db.getUserById(userId);
    if (!user) {
        throw error(404, 'Benutzer nicht gefunden');
    }

    // 🔥 SICHERHEITS-UPDATE 1: Abfangen, falls systemId im User-Objekt fehlt
    const systemContext = user.systems?.find(s => s.systemId?.toString() === currentSystemId);
    if (!systemContext) {
        throw error(403, 'Kein Zugriff auf dieses System');
    }

    // Alle Benutzer laden, die diesem System zugeordnet sind.
    const members = await db.getUsersBySystem(currentSystemId);

    // 🔥 SICHERHEITS-UPDATE 2: Alles mit Fragezeichen (?) absichern, bevor .toString() gerufen wird
    const serializedMembers = members.map(m => {
        const sys = m.systems?.find(s => s.systemId?.toString() === currentSystemId);
        return {
            id: m._id?.toString() || 'unknown',
            username: m.username || null,
            email: m.email || null,
            firstName: m.firstName || '',
            lastName: m.lastName || '',
            role: sys ? sys.role : 'user',
            mustChangePassword: m.mustChangePassword || false,
            isVerified: m.isVerified !== false // Falls isVerified fehlt, gehen wir von true aus
        };
    });

    return {
        members: serializedMembers,
        currentUserId: userId,
        currentUserRole: systemContext.role
    };
}