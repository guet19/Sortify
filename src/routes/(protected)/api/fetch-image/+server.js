import { error } from '@sveltejs/kit';

export async function GET({ url }) {
    const imageUrl = url.searchParams.get('url');
    if (!imageUrl) throw error(400, 'Keine Bild-URL übergeben');

    try {
        const targetUrlObj = new URL(imageUrl);
        
        const response = await fetch(imageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                // NEU: Der Referer trickst den Hotlink-Schutz des Shops aus!
                'Referer': targetUrlObj.origin,
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            }
        });

        if (!response.ok) throw new Error(`Bild blockiert (Status: ${response.status})`);

        const buffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'image/jpeg';

        return new Response(buffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400'
            }
        });
    } catch (err) {
        console.error("Fetch-Image Fehler:", err);
        throw error(500, 'Fehler beim Laden des Bildes');
    }
}