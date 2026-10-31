import { AUTOFOCUS, firstCandidate, isNavigable, nearest, type Direction } from "./focusTargets";
import { isClaimed } from "./keyClaims";
import { activeLayer, isModalLayer } from "./layers";
import { focusWithoutKeyboard, isQuiet, isTextField, raiseKeyboard } from "./textFields";

const DIRECTIONS: Record<string, Direction> = {
	ArrowUp: "up",
	ArrowDown: "down",
	ArrowLeft: "left",
	ArrowRight: "right",
};

const AUTOFOCUS_WAIT_FRAMES = 90;

function focusElement(element: HTMLElement) {
	if (isTextField(element)) focusWithoutKeyboard(element);
	else element.focus({ preventScroll: true });
}

export function moveFocusTo(element: HTMLElement) {
	focusElement(element);
	element.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
}

function focusedWithin(layer: HTMLElement) {
	const focused = document.activeElement;
	return focused instanceof HTMLElement && focused !== layer && layer.contains(focused) ? focused : null;
}

/** While typing, left and right move the caret until it reaches the edge of the text. */
function keepsArrowKey(element: HTMLElement, direction: Direction) {
	if (!isTextField(element) || isQuiet(element)) return false;
	const { selectionStart, selectionEnd, value } = element;
	if (selectionStart === null || selectionEnd === null) return false;
	if (direction === "left") return selectionStart > 0;
	if (direction === "right") return selectionEnd < value.length;
	return false;
}

/** OK on a resting text field raises its keyboard; buttons, links and inputs act on Enter themselves; anything else needs a click. */
function activate(element: HTMLElement) {
	if (isTextField(element)) {
		if (!isQuiet(element)) return false;
		raiseKeyboard(element);
		return true;
	}
	if (element instanceof HTMLButtonElement || element instanceof HTMLAnchorElement || element instanceof HTMLInputElement) {
		return false;
	}
	element.click();
	return true;
}

/** Runs in the capture phase, so dialogs that stop key propagation still navigate. */
function handleKeydown(event: KeyboardEvent) {
	if (isClaimed(event)) {
		event.preventDefault();
		event.stopPropagation();
		return;
	}

	const layer = activeLayer();
	const current = focusedWithin(layer);
	const direction = DIRECTIONS[event.key];

	if (direction) {
		if (current && keepsArrowKey(current, direction)) return;
		event.preventDefault();
		const next = current ? nearest(current, direction, layer) : firstCandidate(layer);
		if (next) moveFocusTo(next);
		return;
	}

	if (event.key === "Enter" && current && activate(current)) {
		event.preventDefault();
	}
}

/**
 * Puts focus inside the layer right away, then moves it to the preferred element
 * if that renders a little later, as long as the remote hasn't been touched since.
 */
export function focusWhenReady(layer: HTMLElement) {
	let frames = 0;
	let placeholder: HTMLElement | null = null;
	const attempt = () => {
		if (!layer.isConnected) return;
		const focused = focusedWithin(layer);
		if (focused && focused !== placeholder) return;
		const preferred = layer.querySelector<HTMLElement>(AUTOFOCUS);
		if (preferred && isNavigable(preferred)) {
			moveFocusTo(preferred);
			return;
		}
		if (!focused) {
			placeholder = firstCandidate(layer);
			if (placeholder) focusElement(placeholder);
		}
		frames += 1;
		if (frames < AUTOFOCUS_WAIT_FRAMES) requestAnimationFrame(attempt);
	};
	requestAnimationFrame(attempt);
}

/** Remembers what was focused under each modal so closing it hands focus back. */
function trackModals() {
	const returnFocus = new Map<Node, HTMLElement | null>();
	new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			mutation.addedNodes.forEach((node) => {
				if (!isModalLayer(node)) return;
				node.dataset.tvModal = "";
				const previous = document.activeElement;
				returnFocus.set(node, previous instanceof HTMLElement && previous !== document.body ? previous : null);
				focusWhenReady(node);
			});
			mutation.removedNodes.forEach((node) => {
				if (!returnFocus.has(node)) return;
				const previous = returnFocus.get(node);
				returnFocus.delete(node);
				if (previous?.isConnected && isNavigable(previous)) moveFocusTo(previous);
				else focusWhenReady(activeLayer());
			});
		}
	}).observe(document.body, { childList: true });
}

export function startSpatialNavigation() {
	window.addEventListener("keydown", handleKeydown, true);
	trackModals();
}
