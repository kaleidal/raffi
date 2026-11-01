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

const OUTSIDE_ROWS = `:is(${FOCUSABLE}):not(${ROW} *)`;

type Scored = Array<[number, HTMLElement]>;

/** Scores by geometry alone; styles are only checked on the winner, which keeps a key press cheap on slow TVs. */
function rank(candidates: Iterable<HTMLElement>, from: HTMLElement, origin: DOMRect, direction: Direction): Scored {
	const scored: Scored = [];
	for (const candidate of candidates) {
		if (candidate === from || candidate.contains(from)) continue;
		const rect = candidate.getBoundingClientRect();
		if (!hasSize(rect)) continue;
		const score = distance(origin, rect, direction);
		if (score !== null) scored.push([score, candidate]);
	}
	return scored.sort((a, b) => a[0] - b[0]);
}

const firstShown = (scored: Scored) => scored.find(([, candidate]) => isShown(candidate))?.[1] ?? null;

const PINNED = "[data-tv-pinned]";
const isPinned = (element: HTMLElement) => element.closest(PINNED) !== null;

/** Bars pinned over the page are reached once nothing in the page lies that way, so they never interrupt browsing the rows. */
function contentFirst(scored: Scored, from: HTMLElement): Scored {
	if (isPinned(from)) return scored;
	return [...scored.filter(([, candidate]) => !isPinned(candidate)), ...scored.filter(([, candidate]) => isPinned(candidate))];
}

/**
 * Each row of cards competes as a single box, and only the winning row has its cards measured,
 * so a press measures a few dozen elements instead of every card on the page.
 */
function closestInLayer(layer: HTMLElement, from: HTMLElement, origin: DOMRect, direction: Direction) {
	const candidates = [...layer.querySelectorAll<HTMLElement>(OUTSIDE_ROWS), ...layer.querySelectorAll<HTMLElement>(ROW)];
	for (const [, candidate] of contentFirst(rank(candidates, from, origin, direction), from)) {
		const match = candidate.matches(ROW)
			? firstShown(rank(focusables(candidate), from, origin, direction))
			: isShown(candidate) && candidate;
		if (match) return match;
	}
	return null;
}

/** Moving sideways stays inside the current row of cards when it can. */
export function nearest(from: HTMLElement, direction: Direction, layer: HTMLElement) {
	const origin = from.getBoundingClientRect();
	const row = direction === "left" || direction === "right" ? from.closest<HTMLElement>(ROW) : null;
	return (row && firstShown(rank(focusables(row), from, origin, direction))) || closestInLayer(layer, from, origin, direction);
}
