<script>
    import ArticleDetail from '$lib/components/ArticleDetail.svelte';
    export let data;
</script>

<!-- Gleiches Layout wie die Artikelseite, aber ohne Kopieren, Bearbeiten und Bestandsänderung -->
<ArticleDetail {data} terminal />
