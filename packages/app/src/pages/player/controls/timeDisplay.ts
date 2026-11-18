const SHOW_REMAINING_KEY = "player_show_remaining";

export const readShowRemaining = () => localStorage.getItem(SHOW_REMAINING_KEY) === "true";

export const persistShowRemaining = (value: boolean) => localStorage.setItem(SHOW_REMAINING_KEY, String(value));
