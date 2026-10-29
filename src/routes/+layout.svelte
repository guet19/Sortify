<script>
    import "./styles.css";
    import { page } from "$app/stores";
    import { canAccessPath } from "$lib/permissions.js";
    import favicon from "$lib/assets/favicon.svg";
    let { children } = $props();

    // Lager für das Dropdown in der Menüleiste
    let systems = $derived($page.data.systems || []);
    let activeSystem = $derived(systems.find(s => s.id === $page.data.activeSystemId));
    // Zuschaltbare Funktion "Projekte" (Einstellungen › Funktionen)
    let projectsOn = $derived(activeSystem?.features?.projects === true);

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

        return canAccessPath(path, allowed);
    }
</script>

<svelte:head>
    <link rel="icon" href={favicon} />
</svelte:head>

{#if !$page.url.pathname.startsWith('/terminal') && !$page.url.pathname.startsWith('/foto/')}
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

                <!-- Nachbestellen -->
                {#if canSee('/nachbestellen')}
                    <a
                        class="nav-link"
                        class:active={$page.url.pathname === "/nachbestellen"}
                        href="/nachbestellen">Nachbestellen</a
                    >
                {/if}

                <!-- Projekte (nur wenn die Funktion im Lager eingeschaltet ist) -->
                {#if projectsOn && canSee('/projekte')}
                    <a
                        class="nav-link"
                        class:active={$page.url.pathname.startsWith("/projekte")}
                        href="/projekte">Projekte</a
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
                <div class="d-flex align-items-center gap-3 user-area">
                    <!-- Lager-Umschalter (eingeklappte Menüleiste: eigene Zeile, Menü linksbündig) -->
                    <div class="dropdown system-dropdown">
                        <button
                            class="btn system-switch dropdown-toggle space-grotesk"
                            type="button"
                            data-bs-toggle="dropdown"
                            data-bs-display="static"
                            aria-expanded="false"
                        >
                            <i class="bi bi-box-seam"></i>
                            <span class="system-switch-name">{activeSystem?.name || 'Lager wählen'}</span>
                        </button>
                        <ul class="dropdown-menu dropdown-menu-lg-end shadow-sm">
                            {#if systems.length > 0}
                                <li><h6 class="dropdown-header">Lager wechseln</h6></li>
                                {#each systems as system (system.id)}
                                    <li>
                                        <!-- Normaler POST (kein enhance), damit alle Daten des neuen Lagers frisch geladen werden -->
                                        <form method="POST" action="/select-system?/select">
                                            <input type="hidden" name="systemId" value={system.id} />
                                            <button
                                                type="submit"
                                                class="dropdown-item d-flex justify-content-between align-items-center gap-3"
                                                class:active={system.id === $page.data.activeSystemId}
                                                disabled={system.id === $page.data.activeSystemId}
                                            >
                                                <span>{system.name}</span>
                                                <small class="text-body-secondary">{system.roleName}</small>
                                            </button>
                                        </form>
                                    </li>
                                {/each}
                                <li><hr class="dropdown-divider" /></li>
                            {/if}
                            <li>
                                <a class="dropdown-item" href="/lager">
                                    <i class="bi bi-pencil-square me-2"></i>Lager bearbeiten
                                </a>
                            </li>
                            {#if canSee('/einstellungen/funktionen')}
                                <li>
                                    <a class="dropdown-item" href="/einstellungen/funktionen">
                                        <i class="bi bi-toggles me-2"></i>Funktionen
                                    </a>
                                </li>
                            {/if}
                        </ul>
                    </div>

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

                    <!-- Logout per POST (ein Link könnte von fremden Seiten ausgelöst werden) -->
                    <form method="POST" action="/logout" class="m-0 logout-form">
                        <button type="submit" class="btn btn-danger m-0">Abmelden</button>
                    </form>
                </div>
            {/if}
        </div>
    </div>
</nav>
{/if}

{@render children()}