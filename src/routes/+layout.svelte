<script>
    import "./styles.css";
    import { page } from "$app/stores";
    import favicon from "$lib/assets/favicon.svg";
    let { children } = $props();
</script>

<svelte:head>
    <link rel="icon" href={favicon} />
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet">
</svelte:head>

<!-- Die Navbar wird auf allen Seiten im Ordner /terminal ausgeblendet -->
{#if !$page.url.pathname.startsWith('/terminal')}
<nav class="navbar navbar-expand-lg bg-body-tertiary">
    <div class="container">
        <a
            class="navbar-brand d-flex align-items-center gap-1 space-grotesk"
            style="color:#22c55e;"
            href="/"
        >
            <im
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
                <a
                    class="nav-link"
                    class:active={$page.url.pathname === "/"}
                    href="/">Inventar</a
                >
                <a
                    class="nav-link"
                    class:active={$page.url.pathname ===
                        "/einstellungen/category"}
                    href="/einstellungen/category"
                    >Kategorien/Filter verwalten</a
                >
                <a
                    class="nav-link"
                    class:active={$page.url.pathname === "/tools"}
                    href="/tools">Tools</a
                >
            </div>

            {#if $page.data.isLoggedIn && $page.data.user}
                <div class="d-flex align-items-center gap-3">
                    <a
                        href="/profil"
                        class="text-decoration-none d-flex align-items-center gap-2 user-link space-grotesk"
                    >
                        <div class="user-avatar">
                            {$page.data.user.firstName.charAt(0).toUpperCase()}
                        </div>
                        <span class="user-name"
                            >{$page.data.user.firstName}</span
                        >
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

<!-- Hier rendert SvelteKit die Unterseiten (entweder inkl. Navbar für Web oder im Vollbild für das Terminal) -->
{@render children()}