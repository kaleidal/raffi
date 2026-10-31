/**
 * On a TV, focusing a text field pops the on-screen keyboard over half the screen.
 * Fields reached with the remote stay read-only, so they neither raise the keyboard
 * nor swallow OK, until OK is pressed on them.
 */

type TextField = HTMLInputElement | HTMLTextAreaElement;

const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "password", "url", "number", "tel"]);

export const isTextField = (element: Element): element is TextField =>
	element instanceof HTMLTextAreaElement ||
	(element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(element.type));

/** True while the field has focus from the remote but its keyboard hasn't been raised. */
export const isQuiet = (field: TextField) => field.dataset.tvQuiet !== undefined;

function wake(field: TextField) {
	if (!isQuiet(field)) return;
	delete field.dataset.tvQuiet;
	field.readOnly = false;
}

export function focusWithoutKeyboard(field: TextField) {
	if (!field.readOnly) {
		field.readOnly = true;
		field.dataset.tvQuiet = "";
		field.addEventListener("blur", () => wake(field), { once: true });
	}
	field.focus({ preventScroll: true });
}

/** Refocusing an editable field during the OK key press counts as a user gesture, which raises the keyboard. */
export function raiseKeyboard(field: TextField) {
	wake(field);
	field.blur();
	field.focus({ preventScroll: true });
}
