import adapter from '@sveltejs/adapter-netlify';
export default {
	kit: {
		adapter: adapter({
			edge: false,
			split: false
		}),
		// Content-Security-Policy: legt fest, woher Skripte, Styles & Co. geladen werden dürfen.
		// SvelteKit ergänzt für eigene Inline-Skripte automatisch eine Nonce.
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self', 'https://cdn.jsdelivr.net'],
				// 'unsafe-inline' nötig für style="..."-Attribute und Svelte-Übergänge
				'style-src': ['self', 'unsafe-inline', 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
				'font-src': ['self', 'data:', 'https://cdn.jsdelivr.net', 'https://fonts.gstatic.com'],
				// Artikelbilder kommen von Cloudinary und beliebigen Shops, QR-Codes als data:-URL
				'img-src': ['self', 'data:', 'blob:', 'https:'],
				'connect-src': ['self'],
				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'frame-ancestors': ['none']
			}
		}
	}
};
