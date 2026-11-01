import { isTvPlatform } from "../shell/platform";
import { startRemoteNavigation } from "../tv/remote";
import { handleBack } from "./back";
import { onNative, startBridge } from "./bridge";

/** TVs lay the interface out as a 1280-wide screen seen from the couch; phones use their own width. */
function applyViewport() {
	document.documentElement.dataset.platform = isTvPlatform ? "tv" : "android";
	document
		.querySelector('meta[name="viewport"]')
		?.setAttribute("content", isTvPlatform ? "width=1280" : "width=device-width, initial-scale=1, viewport-fit=cover");
}

export function startAndroidShell() {
	applyViewport();
	startBridge();
	onNative("key.back", handleBack);
	if (isTvPlatform) startRemoteNavigation();
}
