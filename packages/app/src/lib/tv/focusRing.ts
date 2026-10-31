/**
 * Draws the remote's focus indicator on one overlay above the whole page, so no
 * scrolling row or rounded container can clip it. It is anchored to the focused
 * element with CSS anchor positioning, which keeps it attached through scrolling
 * and layout changes without any per-frame work, and takes that element's corner
 * shape. Elements that style their own focus opt out with `data-own-focus`; a
 * wrapper marked `data-focus-ring` takes the ring for its contents.
 */

const ANCHOR = "--tv-focus";
const GAP_PX = 4;

function ringTarget(focused: Element | null) {
	if (!(focused instanceof HTMLElement) || focused === document.body) return null;
	if (focused.hasAttribute("data-own-focus")) return null;
	return focused.closest<HTMLElement>("[data-focus-ring]") ?? focused;
}

export function startFocusRing() {
	const ring = document.createElement("div");
	ring.className = "tv-focus-ring";
	ring.hidden = true;
	// Anchors must come before the ring in the document, and modals portal to the end of <body>.
	document.documentElement.append(ring);

	let target: HTMLElement | null = null;

	const retarget = () => {
		const next = ringTarget(document.activeElement);
		if (next === target) return;
		target?.style.removeProperty("anchor-name");
		target = next;
		ring.hidden = !target;
		if (!target) return;
		target.style.setProperty("anchor-name", ANCHOR);
		ring.style.borderRadius = `calc(${getComputedStyle(target).borderTopLeftRadius} + ${GAP_PX}px)`;
	};

	document.addEventListener("focusin", retarget);
	document.addEventListener("focusout", () => queueMicrotask(retarget));
}
