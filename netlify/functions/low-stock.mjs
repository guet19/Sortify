// Netlify Scheduled Function: löst werktags den Mindestbestand-Hinweis aus.
// Netlify startet sie selbst nach Zeitplan (auch im Gratisplan). Sie ruft den geschützten
// Endpunkt /api/cron/low-stock mit CRON_SECRET aus den Netlify-Umgebungsvariablen auf.
// Manuell testen: Netlify -> Logs & metrics -> Functions -> low-stock -> "Run now"

export default async () => {
    const baseUrl = (process.env.URL || process.env.BASE_URL || '').replace(/\/$/, '');
    if (!baseUrl || !process.env.CRON_SECRET) {
        console.error('Mindestbestand-Prüfung: URL oder CRON_SECRET fehlt.');
        return new Response('Konfiguration fehlt', { status: 500 });
    }

    const response = await fetch(`${baseUrl}/api/cron/low-stock`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        signal: AbortSignal.timeout(25_000)
    });
    const body = await response.text();
    console.log(`Mindestbestand-Prüfung: HTTP ${response.status} ${body.slice(0, 500)}`);
    return new Response(body, { status: response.status });
};

// Mo–Fr 05:00 UTC (07:00 Uhr Sommerzeit / 06:00 Uhr Winterzeit)
export const config = { schedule: '0 5 * * 1-5' };
