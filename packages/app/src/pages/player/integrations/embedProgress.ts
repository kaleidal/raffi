export function parseEmbedMessageData(value: unknown): Record<string, any> | null {
	if (!value) return null;
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value);
			return parsed && typeof parsed === "object" ? parsed : null;
		} catch {
			return null;
		}
	}
	return typeof value === "object" ? value as Record<string, any> : null;
}

export function firstNonNegativeNumber(...values: unknown[]): number | null {
	for (const value of values) {
		const numeric = Number(value);
		if (Number.isFinite(numeric) && numeric >= 0) return numeric;
	}
	return null;
}

export function readEmbedProgress(value: unknown): {
	time: number;
	duration: number | null;
} | null {
	const data = parseEmbedMessageData(value);
	if (!data) return null;
	const detail = data.data || data.detail || data.payload || data;
	const playerEvent = data.type === "PLAYER_EVENT" ? data.data : null;
	const mediaDataWatched = data.type === "MEDIA_DATA"
		? data.data?.progress?.watched ?? data.data?.progress
		: null;
	const time = firstNonNegativeNumber(
		detail.timestamp,
		detail.currentTime,
		detail.current_time,
		detail.seconds,
		detail.time,
		detail.player_progress,
		playerEvent?.currentTime,
		playerEvent?.time,
		mediaDataWatched,
		data.timestamp,
		data.currentTime,
		data.current_time,
		data.seconds,
		data.time,
	);
	if (time == null) return null;
	return {
		time,
		duration: firstNonNegativeNumber(
			detail.duration,
			detail.player_duration,
			detail.durationSeconds,
			detail.duration_seconds,
			playerEvent?.duration,
			data.duration,
			data.durationSeconds,
		),
	};
}
