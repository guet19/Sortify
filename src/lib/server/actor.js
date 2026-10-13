// Wer hat eine Änderung ausgelöst? Für das Bestandsprotokoll.
export function actor(locals, source) {
    const u = locals.user || {};
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || u.email || '';
    return { userId: u.id || null, userName: name, source };
}
