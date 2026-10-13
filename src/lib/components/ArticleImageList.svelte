<script>
    // Bildleiste für Artikel: Reihenfolge festlegen (erstes Bild = Hauptbild) und Bilder entfernen
    import { MAX_ARTICLE_IMAGES } from '$lib/imageTools.js';

    export let items = [];

    function remove(id) {
        const item = items.find((i) => i.id === id);
        if (item?.kind === 'file') URL.revokeObjectURL(item.preview);
        items = items.filter((i) => i.id !== id);
    }

    function makeMain(id) {
        const item = items.find((i) => i.id === id);
        items = [item, ...items.filter((i) => i.id !== id)];
    }
</script>

{#if items.length > 0}
    <div class="image-list">
        {#each items as item, index (item.id)}
            <div class="image-tile" class:is-main={index === 0}>
                <img src={item.preview} alt="Artikelbild {index + 1}" />
                {#if index === 0}
                    <span class="badge-main">Hauptbild</span>
                {:else}
                    <button type="button" class="btn-make-main" on:click={() => makeMain(item.id)}>Als Hauptbild</button>
                {/if}
                <button type="button" class="btn-remove-image" title="Bild entfernen" aria-label="Bild entfernen" on:click={() => remove(item.id)}>✕</button>
            </div>
        {/each}
    </div>
    <div class="image-count">{items.length} / {MAX_ARTICLE_IMAGES} Bilder · das erste Bild ist das Hauptbild</div>
{/if}

<style>
    .image-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.75rem; margin-top: 0.75rem; }
    .image-tile {
        position: relative; aspect-ratio: 4 / 3; background: #ffffff; border: 2px solid #e2e8f0; border-radius: 8px;
        display: flex; align-items: center; justify-content: center; overflow: hidden;
    }
    .image-tile.is-main { border-color: #22c55e; }
    .image-tile img { width: 100%; height: 100%; object-fit: contain; }
    .badge-main, .btn-make-main {
        position: absolute; left: 0.35rem; bottom: 0.35rem; font-size: 0.7rem; font-weight: 700;
        border-radius: 999px; padding: 0.15rem 0.55rem; border: none;
    }
    .badge-main { background: #22c55e; color: #052e16; }
    .btn-make-main { background: rgba(15, 23, 42, 0.75); color: #fff; cursor: pointer; }
    .btn-make-main:hover { background: #3b82f6; }
    .btn-remove-image {
        position: absolute; top: 0.3rem; right: 0.3rem; width: 26px; height: 26px; border-radius: 50%;
        border: none; background: rgba(239, 68, 68, 0.9); color: #fff; font-size: 0.8rem; cursor: pointer; line-height: 1;
    }
    .btn-remove-image:hover { background: #dc2626; }
    .image-count { margin-top: 0.4rem; font-size: 0.8rem; color: #64748b; }
</style>
