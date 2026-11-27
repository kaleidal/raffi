/** Moves an element to the end of the page so no ancestor can clip or transform it. */
export function portal(node: HTMLElement) {
	document.body.appendChild(node);
	return { destroy: () => node.remove() };
}

/** Like `portal`, but joins the fullscreen element, the only part of the page shown in fullscreen. */
export function fullscreenPortal(node: HTMLElement) {
	(document.fullscreenElement ?? document.body).appendChild(node);
	return { destroy: () => node.remove() };
}

export function portalToBody(node: HTMLElement, enabled: boolean) {
	if (typeof document === "undefined") {
		return { update() {}, destroy() {} };
	}

	const placeholder = document.createComment("search-dock-portal");
	let isPortaled = false;

	const mountToBody = () => {
		if (isPortaled) return;
		const parent = node.parentNode;
		if (!parent) return;
		parent.insertBefore(placeholder, node);
		document.body.appendChild(node);
		isPortaled = true;
	};

	const restoreToParent = () => {
		if (!isPortaled) return;
		const parent = placeholder.parentNode;
		if (!parent) return;
		parent.insertBefore(node, placeholder);
		parent.removeChild(placeholder);
		isPortaled = false;
	};

	if (enabled) mountToBody();

	return {
		update(next: boolean) {
			if (next) mountToBody();
			else restoreToParent();
		},
		destroy() {
			restoreToParent();
		},
	};
}
