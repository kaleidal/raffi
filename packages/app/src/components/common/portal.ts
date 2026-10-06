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
