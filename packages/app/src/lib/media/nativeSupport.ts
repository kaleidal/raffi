export function supportsEac3Playback(videoElem?: HTMLVideoElement): boolean {
	const elem = videoElem ?? document.createElement("video");
	const candidates = [
		'audio/mp4; codecs="ec-3"',
		'audio/mp4; codecs="ec-3, mp4a.40.2"',
		'video/mp4; codecs="avc1.42E01E, ec-3"',
		'video/mp4; codecs="hvc1.1.6.L93.B0, ec-3"',
	];

	for (const type of candidates) {
		const res = elem.canPlayType(type);
		if (res === "probably" || res === "maybe") return true;
	}
	return false;
}

const getMediaPathname = (src: string) => {
	try {
		return new URL(src).pathname.toLowerCase();
	} catch {
		return src.toLowerCase();
	}
};

export function getDirectMediaSupport(src: string, videoElem?: HTMLVideoElement) {
	const elem = videoElem ?? document.createElement("video");
	const pathname = getMediaPathname(src);
	const checks = pathname.endsWith(".mp4")
		? ["video/mp4"]
		: pathname.endsWith(".webm")
			? ["video/webm"]
			: pathname.endsWith(".mkv")
				? ["video/x-matroska", "video/webm"]
				: pathname.endsWith(".mov")
					? ["video/quicktime", "video/mp4"]
					: [];

	if (checks.length === 0) {
		return {
			supported: true,
			confidence: "unknown" as const,
			container: "unknown",
		};
	}

	for (const type of checks) {
		const confidence = elem.canPlayType(type);
		if (confidence === "probably" || confidence === "maybe") {
			return {
				supported: true,
				confidence,
				container: type,
			};
		}
	}

	return {
		supported: false,
		confidence: "" as const,
		container: checks[0],
	};
}
