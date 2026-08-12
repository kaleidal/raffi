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
