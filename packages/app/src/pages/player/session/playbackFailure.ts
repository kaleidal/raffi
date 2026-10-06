type PlaybackFailure = {
	reason?: string | null;
	error?: string | null;
};

const NETWORK_FAILURE_PATTERN =
	/failed to fetch|\bnetwork\b|cors|certificate|cert_|\btls\b|\bssl\b|connection|timed? out|timeout|\bdns\b|name_not_resolved|authority.invalid/i;

export class PlaybackPreparationError extends Error {
	readonly userTitle: string;

	constructor(userTitle: string, details: string) {
		super(details);
		this.name = "PlaybackPreparationError";
		this.userTitle = userTitle;
	}
}

export function describePlaybackFailure(failure: PlaybackFailure): {
	title: string;
	details: string;
} {
	const reason = String(failure.reason || "");
	const error = String(failure.error || "");
	const likelyNetworkFailure =
		(reason === "probe-failed" || reason === "probe-error") &&
		NETWORK_FAILURE_PATTERN.test(error);

	if (likelyNetworkFailure) {
		return {
			title: "Stream connection failed",
			details:
				"Raffi couldn't reach this stream. It may be blocked by your network, carrier, ISP, or DNS provider. Try changing DNS, switching networks, or using a VPN.",
		};
	}

	if (error) {
		return { title: "Stream is not playable", details: error };
	}

	if (reason === "probe-failed" || reason === "probe-error") {
		return {
			title: "Stream inspection failed",
			details:
				"Raffi couldn't inspect this stream. The source may be unavailable or returning an invalid media response.",
		};
	}

	return {
		title: "Stream is not playable",
		details: "This stream needs codecs or a container Raffi cannot currently play.",
	};
}
