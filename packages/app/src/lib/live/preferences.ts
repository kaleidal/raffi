import { writable } from "svelte/store";

export type LiveLayout = "auto" | "guide" | "grid";

function persisted<T>(key: string, fallback: T, isValid: (value: unknown) => value is T) {
	let initial = fallback;
	try {
		const stored = JSON.parse(localStorage.getItem(key) ?? "null");
		if (isValid(stored)) initial = stored;
	} catch {
		// Fall back to the default when storage is unavailable or holds something else.
	}
	const store = writable<T>(initial);
	store.subscribe((value) => {
		try {
			localStorage.setItem(key, JSON.stringify(value));
		} catch {
			// The preference still holds for this session.
		}
	});
	return store;
}

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isLayout = (value: unknown): value is LiveLayout => value === "auto" || value === "guide" || value === "grid";
const isString = (value: unknown): value is string => typeof value === "string";
const isStringMap = (value: unknown): value is Record<string, string> =>
	typeof value === "object" && value !== null && Object.values(value).every(isString);

export const FAVOURITES = "Favourites";
export const ALL_CHANNELS = "All channels";

export const showLiveInHeader = persisted("raffi:live-in-header", false, isBoolean);
export const liveLayout = persisted<LiveLayout>("raffi:live-layout", "auto", isLayout);
export const lastLiveSource = persisted("raffi:live-source", "", isString);
/** The group last open for each source, so coming back lands where you left. */
export const lastLiveGroups = persisted<Record<string, string>>("raffi:live-groups", {}, isStringMap);
