export type ScrubPosition = { ratio: number; rect: DOMRect; clientX: number };

export type ScrubOptions = {
	disabled?: boolean;
	onHover?: (position: ScrubPosition) => void;
	onLeave?: () => void;
	onStart?: (position: ScrubPosition) => void;
	onMove?: (position: ScrubPosition) => void;
	onEnd?: (position: ScrubPosition) => void;
};

/**
 * Horizontal pointer scrubbing for custom sliders. The pointer is captured while a
 * button is held, so dragging keeps working after it leaves the track.
 */
export function pointerScrub(node: HTMLElement, initial: ScrubOptions) {
	let options = initial;
	let dragging = false;
	let last: ScrubPosition | null = null;

	const positionOf = (event: PointerEvent): ScrubPosition => {
		const rect = node.getBoundingClientRect();
		const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
		last = { ratio: Math.min(1, Math.max(0, ratio)), rect, clientX: event.clientX };
		return last;
	};

	const finish = () => {
		if (!dragging || !last) return;
		dragging = false;
		options.onEnd?.(last);
	};

	const onPointerDown = (event: PointerEvent) => {
		if (options.disabled || event.button !== 0) return;
		event.preventDefault();
		node.setPointerCapture(event.pointerId);
		dragging = true;
		options.onStart?.(positionOf(event));
	};

	const onPointerMove = (event: PointerEvent) => {
		const position = positionOf(event);
		options.onHover?.(position);
		if (dragging) options.onMove?.(position);
	};

	const onPointerUp = (event: PointerEvent) => {
		positionOf(event);
		finish();
	};

	const onPointerLeave = () => {
		if (!dragging) options.onLeave?.();
	};

	const onLostCapture = () => {
		finish();
		if (!node.matches(":hover")) options.onLeave?.();
	};

	node.addEventListener("pointerdown", onPointerDown);
	node.addEventListener("pointermove", onPointerMove);
	node.addEventListener("pointerup", onPointerUp);
	node.addEventListener("pointerleave", onPointerLeave);
	node.addEventListener("lostpointercapture", onLostCapture);

	return {
		update(next: ScrubOptions) {
			options = next;
		},
		destroy() {
			node.removeEventListener("pointerdown", onPointerDown);
			node.removeEventListener("pointermove", onPointerMove);
			node.removeEventListener("pointerup", onPointerUp);
			node.removeEventListener("pointerleave", onPointerLeave);
			node.removeEventListener("lostpointercapture", onLostCapture);
		},
	};
}
