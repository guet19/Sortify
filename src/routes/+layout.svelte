<script>
    import "./styles.css";
    import { page } from "$app/stores";
    import favicon from "$lib/assets/favicon.svg";
    let { children } = $props();

    // Zentrale Funktion: Prüft, ob der Menüpunkt gerendert werden darf
    function canSee(path) {
        // 1. "Tools" ist für absolut jeden sichtbar
        if (path === '/tools') return true;

        // 2. Ohne zugewiesene Rolle wird nichts weiter angezeigt
        if (!$page.data.role) return false;

        // 3. Administratoren sehen grundsätzlich das komplette Menü
        if ($page.data.role === 'admin') return true;

        // 4. Dynamische Rollen prüfen
        const allowed = $page.data.allowedRoutes || [];
        
        // Falls die Rolle Vollzugriff hat
        if (allowed.includes('*')) return true;

        // 🔥 FIX: Exakter Match für die Startseite ("/")!
        return allowed.some(r => {
            if (r === '/') return path === '/';
            return path.startsWith(r);
        });
    }
</script>

<svelte:head>
    <link rel="icon" href={favicon} />
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet">
</svelte:head>

{#if !$page.url.pathname.startsWith('/terminal')}
<nav class="navbar navbar-expand-lg bg-body-tertiary">
    <div class="container">
        <!-- Das Logo verlinkt weiterhin auf "/", der Türsteher leitet User ohne Rechte dann smart weiter -->
        <a
            class="navbar-brand d-flex align-items-center gap-1 space-grotesk"
            style="color:#22c55e;"
            href="/"
        >
            <img
                src={favicon}
                alt="Logo"
                width="50"
                height="40"
                class="d-inline-block align-text-top"
            />Sortify</a
        >
        <button
            class="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#navbarNavAltMarkup"
            aria-controls="navbarNavAltMarkup"
            aria-expanded="false"
            aria-label="Toggle navigation"
        >
            <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarNavAltMarkup">
            <div class="navbar-nav me-auto">
                
                <!-- 🔥 Inventar -->
                {#if canSee('/')}
                    <a
                        class="nav-link"
                        class:active={$page.url.pathname === "/"}
                        href="/">Inventar</a
                    >
                {/if}

                <!-- 🔥 Kategorien -->
                {#if canSee('/einstellungen/category')}
                    <a
                        class="nav-link"
                        class:active={$page.url.pathname === "/einstellungen/category"}
                        href="/einstellungen/category"
                        >Kategorien/Filter verwalten</a
                    >
                {/if}

                <!-- 🔥 Teamverwaltung -->
                {#if canSee('/einstellungen/team')}
                    <a
                        class="nav-link"
                        class:active={$page.url.pathname === "/einstellungen/team"}
                        href="/einstellungen/team"
                        >Team/Rollen verwalten</a
                    >
                {/if}

                <!-- 🔥 Tools (immer sichtbar durch canSee Logik) -->
                {#if canSee('/tools')}
                    <a
                        class="nav-link"
                        class:active={$page.url.pathname === "/tools"}
                        href="/tools">Tools</a
                    >
                {/if}

            </div>

            {#if $page.data.isLoggedIn && $page.data.user}
                <div class="d-flex align-items-center gap-3">
                    <a
                        href="/profil"
                        class="text-decoration-none d-flex align-items-center gap-2 user-link space-grotesk"
                    >
                        <div class="user-avatar">
                            {($page.data.user.firstName || $page.data.user.username || $page.data.user.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <span class="user-name">
                            {$page.data.user.firstName || $page.data.user.username || 'Benutzer'}
                        </span>
                    </a>

                    <a
                        href="/logout"
                        class="btn btn-danger m-0"
                        data-sveltekit-reload>Abmelden</a
                    >
                </div>
            {/if}
        </div>
    </div>
</nav>
{/if}

{@render children()}