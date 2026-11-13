/** Lowercased letters and digits only, so "BBC One HD" and "bbc.one.hd" meet. */
export function matchKey(value: string | undefined) {
	return (value ?? "")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/&/g, "and")
		.replace(/[^a-z0-9]+/g, "");
}

const QUALITY_TAGS = new Set(["hd", "fhd", "uhd", "sd", "4k", "8k", "hevc", "h265", "1080p", "720p", "hq"]);

/** Like `matchKey`, but blind to quality tags, since playlists and guides rarely agree on them: "ITV1.uk" meets "ITV1.HD.uk". */
export function channelKey(value: string | undefined) {
	return (value ?? "")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/&/g, "and")
		.split(/[^a-z0-9]+/)
		.filter((token) => token && !QUALITY_TAGS.has(token))
		.join("");
}

const QUOTED_ATTRIBUTE = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function quotedAttributes(text: string) {
	const attributes: Record<string, string> = {};
	for (const match of text.matchAll(QUOTED_ATTRIBUTE)) {
		attributes[match[1].toLowerCase()] = (match[2] ?? match[3] ?? "").trim();
	}
	return attributes;
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string) {
	if (!text.includes("&")) return text;
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
		if (body[0] !== "#") return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
		const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
		return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
	});
}

/** The text inside an element, with CDATA kept as is and any markup dropped. */
export function elementText(inner: string) {
	let text = "";
	let cursor = 0;
	for (const match of inner.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)) {
		text += decodeEntities(inner.slice(cursor, match.index).replace(/<[^>]*>/g, ""));
		text += match[1];
		cursor = match.index + match[0].length;
	}
	text += decodeEntities(inner.slice(cursor).replace(/<[^>]*>/g, ""));
	return text.trim();
}
