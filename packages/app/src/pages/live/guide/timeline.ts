export const MINUTE = 60_000;
export const SLOT = 30 * MINUTE;
export const SPAN = 48 * 60 * MINUTE;

/** The guide starts at the half hour before the last one, so what's on now sits a little in from the left. */
export const timelineStart = (now: number) => Math.floor(now / SLOT) * SLOT - SLOT;

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short" });

export const formatClock = (time: number) => timeFormat.format(time);

export function slotLabel(time: number) {
	const date = new Date(time);
	return date.getHours() === 0 && date.getMinutes() === 0 ? `${dayFormat.format(date)} ${formatClock(time)}` : formatClock(time);
}

export function slotsBetween(from: number, until: number) {
	const slots: number[] = [];
	for (let time = Math.ceil(from / SLOT) * SLOT; time < until; time += SLOT) slots.push(time);
	return slots;
}
