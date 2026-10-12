import { error } from '@sveltejs/kit';
import { safeFetch, readLimited } from '$lib/server/security.js';

// Nur echte Rasterbilder durchreichen – kein HTML/SVG, sonst könnte fremder Code
// unter unserer Domain ausgeführt werden
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function GET({ url }) {
    const imageUrl = url.searchParams.get('url');
    if (!imageUrl) throw error(400, 'Keine Bild-URL übergeben');

    let response;
    try {
        const targetUrlObj = new URL(imageUrl);
        response = await safeFetch(imageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                // Der Referer umgeht den Hotlink-Schutz des Shops
                'Referer': targetUrlObj.origin,
                'Accept': 'image/avif,image/webp,image/apng,image/*;q=0.8'
            }
        });
    } catch (err) {
        console.error("Fetch-Image Fehler:", err.message);
        throw error(400, 'Bild-URL nicht erlaubt oder nicht erreichbar');
    }

    if (!response.ok) throw error(502, `Bild blockiert (Status: ${response.status})`);

    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.includes(contentType)) {
        throw error(415, 'Die URL liefert kein unterstütztes Bild');
    }

    let buffer;
    try {
        buffer = await readLimited(response, MAX_BYTES);
    } catch (err) {
        throw error(413, 'Bild ist zu groß');
    }

    return new Response(buffer, {
        headers: {
            'Content-Type': contentType,
            'X-Content-Type-Options': 'nosniff',
            'Content-Disposition': 'inline',
            'Content-Security-Policy': "default-src 'none'; sandbox",
            'Cache-Control': 'private, max-age=86400'
        }
    });
}
