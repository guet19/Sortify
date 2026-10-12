<script>
    import ArticleOverview from '$lib/components/ArticleOverview.svelte';
    export let data;
</script>

<!-- Gleiches Layout wie die Inventar-Startseite, aber nur eingelagerte Artikel und ohne Verwaltung -->
<ArticleOverview {data} terminal />
