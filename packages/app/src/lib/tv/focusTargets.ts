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

const ROW = "[data-scroll-row]";

const hasSize = (rect: DOMRect) => rect.width > 0 && rect.height > 0;

const isShown = (element: HTMLElement) =>
	getComputedStyle(element).visibility !== "hidden" && !element.closest("[inert]");

export const isNavigable = (element: HTMLElement) => hasSize(element.getBoundingClientRect()) && isShown(element);

const isInViewport = (rect: DOMRect) =>
	rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;

const focusables = (scope: HTMLElement) => scope.querySelectorAll<HTMLElement>(FOCUSABLE);

export function firstCandidate(layer: HTMLElement) {
	const preferred = layer.querySelector<HTMLElement>(AUTOFOCUS);
	if (preferred && isNavigable(preferred)) return preferred;
	let offscreen: HTMLElement | null = null;
	for (const element of focusables(layer)) {
		const rect = element.getBoundingClientRect();
		if (!hasSize(rect) || !isShown(element)) continue;
		if (isInViewport(rect)) return element;
		offscreen ??= element;
	}
	return offscreen;
}

/** Scores by geometry alone and only checks styles on the winner, which keeps a key press cheap on slow TVs. */
function closestIn(scope: HTMLElement, from: HTMLElement, direction: Direction) {
	const origin = from.getBoundingClientRect();
	const scored: Array<[number, HTMLElement]> = [];
	for (const candidate of focusables(scope)) {
		if (candidate === from || candidate.contains(from)) continue;
		const rect = candidate.getBoundingClientRect();
		if (!hasSize(rect)) continue;
		const score = distance(origin, rect, direction);
		if (score !== null) scored.push([score, candidate]);
	}
	scored.sort((a, b) => a[0] - b[0]);
	return scored.find(([, candidate]) => isShown(candidate))?.[1] ?? null;
}

/** Moving sideways stays inside the current row of cards when it can, so most presses never scan the whole page. */
export function nearest(from: HTMLElement, direction: Direction, layer: HTMLElement) {
	const row = direction === "left" || direction === "right" ? from.closest<HTMLElement>(ROW) : null;
	return (row && closestIn(row, from, direction)) ?? closestIn(layer, from, direction);
}
