/**
 * Web-specific player helpers for direct/debrid streams.
 * This is the happy path for web.raffi.al
 */

export function hasDirectStreamParam(): string | null {
	if (typeof window === 'undefined') return null;
	const params = new URLSearchParams(window.location.search);
	return params.get('stream') || params.get('url') || params.get('src');
}

export function openDirectStreamInPlayer(url: string) {
	// In the future we will use the shared router + player loading logic
	// For now this is a placeholder that logs the intent
	console.log('[Raffi Web] Would open direct stream:', url);

	// TODO: Integrate with the shared player session loader
	// using the bypass path for http sources
	alert('Direct stream support coming in next iteration. For now paste links inside the app once loaded.');
}
