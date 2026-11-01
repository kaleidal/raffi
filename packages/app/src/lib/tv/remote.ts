import { activeLayer } from "../android/layers";
import { router } from "../stores/router";
import { startFocusRing } from "./focusRing";
import { focusWhenReady, startSpatialNavigation } from "./spatialNavigation";

/** Arrow keys move focus between items, a ring shows where it is, and each new page starts with something focused. */
export function startRemoteNavigation() {
	startSpatialNavigation();
	startFocusRing();

	let lastPage: string | null = null;
	router.subscribe(({ page }) => {
		if (page === lastPage) return;
		lastPage = page;
		focusWhenReady(activeLayer());
	});
}
