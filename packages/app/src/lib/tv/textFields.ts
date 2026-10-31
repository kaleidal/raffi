/**
 * On a TV, focusing a text field pops the on-screen keyboard over half the screen.
 * Fields reached with the remote stay quiet until OK is pressed on them.
 */

type TextField = HTMLInputElement | HTMLTextAreaElement;

const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "password", "url", "number", "tel"]);

export const isTextField = (element: Element): element is TextField =>
	element instanceof HTMLTextAreaElement ||
	(element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(element.type));

export const isKeyboardHeldBack = (field: TextField) => field.dataset.tvInputMode !== undefined;

function releaseKeyboard(field: TextField) {
	const original = field.dataset.tvInputMode;
	if (original === undefined) return;
	delete field.dataset.tvInputMode;
	if (original) field.setAttribute("inputmode", original);
	else field.removeAttribute("inputmode");
}

export function focusWithoutKeyboard(field: TextField) {
	field.dataset.tvInputMode = field.getAttribute("inputmode") ?? "";
	field.setAttribute("inputmode", "none");
	field.addEventListener("blur", () => releaseKeyboard(field), { once: true });
	field.focus({ preventScroll: true });
}

export function raiseKeyboard(field: TextField) {
	releaseKeyboard(field);
	field.blur();
	field.focus({ preventScroll: true });
}
