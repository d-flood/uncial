const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

/** The player URL for a YouTube or Vimeo page URL; null for anything else. */
export function embedPlayerSrc(value: string): string | null {
	let url: URL;
	try {
		url = new URL(value.trim());
	} catch {
		return null;
	}
	const segments = url.pathname.split('/').filter(Boolean);
	if (YOUTUBE_HOSTS.has(url.hostname)) {
		const id =
			url.hostname === 'youtu.be'
				? segments[0]
				: ['embed', 'shorts', 'live'].includes(segments[0] ?? '')
					? segments[1]
					: url.searchParams.get('v');
		return id && /^[\w-]+$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
	}
	if (VIMEO_HOSTS.has(url.hostname)) {
		const id = segments.find((segment) => /^\d+$/.test(segment));
		return id ? `https://player.vimeo.com/video/${id}` : null;
	}
	return null;
}
