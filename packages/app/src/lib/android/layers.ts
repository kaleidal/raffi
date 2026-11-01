/**
 * Modals portal a full-screen backdrop onto `document.body`, after the app root.
 * The last one is the layer the remote is driving; without one, the whole page is.
 * Smaller portaled pieces, like the search bar, belong to the page.
 */

export function isModalLayer(node: Node): node is HTMLElement {
	if (!(node instanceof HTMLElement) || node.parentElement !== document.body) return false;
	const rect = node.getBoundingClientRect();
	return rect.width >= innerWidth - 1 && rect.height >= innerHeight - 1;
}

export function topModal(): HTMLElement | null {
	const children = document.body.children;
	for (let index = children.length - 1; index >= 0; index -= 1) {
		const child = children[index];
		if (child.id !== "app" && isModalLayer(child)) return child;
	}
	return null;
}

export function activeLayer(): HTMLElement {
	return topModal() ?? document.body;
}
