/** Rows drawn beyond each edge of the view, so the remote always has a neighbour to move to. */
const OVERSCAN = 6;

export function visibleRows(scrollTop: number, viewportHeight: number, rowHeight: number, count: number) {
	const first = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
	const last = Math.min(count, Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN);
	return { first, last };
}

export const remToPx = (rem: number) => rem * parseFloat(getComputedStyle(document.documentElement).fontSize);

/** Calls `onChange` once per frame while the element scrolls or resizes. */
export function trackViewport(node: HTMLElement, onChange: () => void) {
	let frame = 0;
	const schedule = () => {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			onChange();
		});
	};
	const resize = new ResizeObserver(schedule);
	resize.observe(node);
	node.addEventListener("scroll", schedule, { passive: true });
	return () => {
		cancelAnimationFrame(frame);
		resize.disconnect();
		node.removeEventListener("scroll", schedule);
	};
}
