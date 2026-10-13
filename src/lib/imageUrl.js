// Cloudinary liefert Bilder auf Wunsch verkleinert und im besten Format für den Browser (WebP/AVIF).
// So laden Listen und Vorschaubilder nur einen Bruchteil der Daten. Andere Bilder bleiben unverändert.
export function imageUrl(url, width) {
    if (!url || typeof url !== 'string') return url;
    const marker = '/image/upload/';
    const i = url.indexOf(marker);
    if (!url.startsWith('https://res.cloudinary.com/') || i === -1) return url;
    const rest = url.slice(i + marker.length);
    if (/^[a-z]_[^/]*\//.test(rest)) return url; // enthält bereits eine Transformation
    return `${url.slice(0, i + marker.length)}c_limit,w_${width},f_auto,q_auto/${rest}`;
}
