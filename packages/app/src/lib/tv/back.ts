import { router } from "../stores/router";
import { sendNative } from "./bridge";
import { topModal } from "./layers";

type BackHandler = () => boolean;

const handlers: BackHandler[] = [];

/** Handlers run newest first; returning true consumes the press. */
export function onBack(handler: BackHandler) {
	handlers.push(handler);
	return () => {
		const index = handlers.indexOf(handler);
		if (index >= 0) handlers.splice(index, 1);
	};
}

/** Modals close on Escape, so the remote's back button speaks the same language. */
function dismissModal(modal: HTMLElement) {
	const focused = document.activeElement;
	const target = focused && modal.contains(focused) ? focused : modal;
	target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
}

export function handleBack() {
	for (let index = handlers.length - 1; index >= 0; index -= 1) {
		if (handlers[index]()) return;
	}
	const modal = topModal();
	if (modal) {
		dismissModal(modal);
		return;
	}
	if (router.back()) return;
	sendNative({ type: "app.exit" });
}
