export type Direction = "up" | "down" | "left" | "right";

const FOCUSABLE = [
	"button:not(:disabled)",
	"a[href]",
	"input:not(:disabled)",
	"textarea:not(:disabled)",
	'[tabindex]:not([tabindex="-1"])',
].join(",");

export const AUTOFOCUS = "[data-tv-autofocus]";

const CROSS_AXIS_WEIGHT = 3;
const CROSS_CENTER_WEIGHT = 0.1;

type Span = { start: number; end: number };

const span = (rect: DOMRect, horizontal: boolean): Span =>
	horizontal ? { start: rect.left, end: rect.right } : { start: rect.top, end: rect.bottom };

const center = ({ start, end }: Span) => (start + end) / 2;

/** Lower is closer; null when `to` doesn't lie in `direction` from `from`. */
function distance(from: DOMRect, to: DOMRect, direction: Direction): number | null {
	const horizontal = direction === "left" || direction === "right";
	const forward = direction === "right" || direction === "down";
	const fromMain = span(from, horizontal);
	const toMain = span(to, horizontal);
	const sign = forward ? 1 : -1;

	const centerAdvance = (center(toMain) - center(fromMain)) * sign;
	const gap = forward ? toMain.start - fromMain.end : fromMain.start - toMain.end;
	const overlapAllowance = Math.min(fromMain.end - fromMain.start, toMain.end - toMain.start) / 2;
	if (centerAdvance <= 0 || gap < -overlapAllowance) return null;

	const fromCross = span(from, !horizontal);
	const toCross = span(to, !horizontal);
	const crossGap = Math.max(0, Math.max(fromCross.start, toCross.start) - Math.min(fromCross.end, toCross.end));
	const crossCenter = Math.abs(center(toCross) - center(fromCross));
	return Math.max(gap, 0) + crossGap * CROSS_AXIS_WEIGHT + crossCenter * CROSS_CENTER_WEIGHT;
}

export function isNavigable(element: HTMLElement) {
	const rect = element.getBoundingClientRect();
	if (rect.width === 0 || rect.height === 0) return false;
	return getComputedStyle(element).visibility !== "hidden" && !element.closest("[inert]");
}

const candidates = (layer: HTMLElement) =>
	Array.from(layer.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isNavigable);

function isInViewport(element: HTMLElement) {
	const rect = element.getBoundingClientRect();
	return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
}

export function firstCandidate(layer: HTMLElement) {
	const preferred = layer.querySelector<HTMLElement>(AUTOFOCUS);
	if (preferred && isNavigable(preferred)) return preferred;
	const all = candidates(layer);
	return all.find(isInViewport) ?? all[0] ?? null;
}

export function nearest(from: HTMLElement, direction: Direction, layer: HTMLElement) {
	const origin = from.getBoundingClientRect();
	let best: HTMLElement | null = null;
	let bestDistance = Infinity;
	for (const candidate of candidates(layer)) {
		if (candidate === from || candidate.contains(from)) continue;
		const score = distance(origin, candidate.getBoundingClientRect(), direction);
		if (score !== null && score < bestDistance) {
			best = candidate;
			bestDistance = score;
		}
	}
	return best;
}
