import { router } from "../stores/router";
import { handleBack } from "./back";
import { onNative, startBridge } from "./bridge";
import { startFocusRing } from "./focusRing";
import { activeLayer } from "./layers";
import { focusWhenReady, startSpatialNavigation } from "./spatialNavigation";

export function startTvShell() {
	startBridge();
	startSpatialNavigation();
	startFocusRing();
	onNative("key.back", handleBack);

	let lastPage: string | null = null;
	router.subscribe(({ page }) => {
		if (page === lastPage) return;
		lastPage = page;
		focusWhenReady(activeLayer());
	});
}
