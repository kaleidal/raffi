const SHOW_REMAINING_KEY = "player_show_remaining";
const CONTROLS_PINNED_KEY = "player_controls_pinned";

export const readShowRemaining = () => localStorage.getItem(SHOW_REMAINING_KEY) === "true";

export const persistShowRemaining = (value: boolean) => localStorage.setItem(SHOW_REMAINING_KEY, String(value));

export const readControlsPinned = () => localStorage.getItem(CONTROLS_PINNED_KEY) === "true";

export const persistControlsPinned = (value: boolean) => localStorage.setItem(CONTROLS_PINNED_KEY, String(value));
