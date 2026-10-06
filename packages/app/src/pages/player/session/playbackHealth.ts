export type PlaybackStall = {
	endedAt: number;
	durationMs: number;
};

export const LONG_PLAYBACK_STALL_MS = 12_000;

const STALL_WINDOW_MS = 90_000;
const MIN_STALL_MS = 1_500;

export function recordPlaybackStall(
	stalls: PlaybackStall[],
	durationMs: number,
	endedAt = Date.now(),
): PlaybackStall[] {
	const recent = stalls.filter(
		(stall) => endedAt - stall.endedAt <= STALL_WINDOW_MS,
	);
	if (durationMs < MIN_STALL_MS) return recent;
	return [...recent, { endedAt, durationMs }];
}

export function shouldSuggestAnotherStream(stalls: PlaybackStall[]): boolean {
	if (stalls.some((stall) => stall.durationMs >= LONG_PLAYBACK_STALL_MS)) {
		return true;
	}

	const totalDuration = stalls.reduce(
		(total, stall) => total + stall.durationMs,
		0,
	);
	return (
		(stalls.length >= 2 && totalDuration >= 10_000) ||
		(stalls.length >= 3 && totalDuration >= 6_000)
	);
}
