import { untrack } from "svelte";
import * as Subtitles from "./subtitles";

const SUBTITLE_CONTROLS_MARGIN_PX = 26;
const CONTROLS_SETTLE_MS = 350;

/** Keeps subtitle cues just above the player controls, following them as they slide in and out. */
export function createCuePositioning({
    getContainer,
    getPanel,
    getVideo,
    isControlsVisible,
}: {
    getContainer: () => HTMLElement | undefined;
    getPanel: () => HTMLElement | null;
    getVideo: () => HTMLVideoElement | undefined;
    isControlsVisible: () => boolean;
}) {
    let linePercent = $state(92);

    const measure = () => {
        linePercent = Subtitles.computeCueLinePercent(
            getContainer() ?? null,
            getPanel(),
            isControlsVisible(),
            SUBTITLE_CONTROLS_MARGIN_PX,
        );
    };

    const reposition = () => {
        measure();
        Subtitles.updateCuePositions(getVideo() ?? null, linePercent);
    };

    $effect.pre(measure);

    $effect(() => {
        Subtitles.updateCuePositions(getVideo() ?? null, linePercent);
    });

    $effect(() => {
        isControlsVisible();
        untrack(reposition);
        // Follow the controls while they slide, then once more after they settle.
        requestAnimationFrame(() => requestAnimationFrame(reposition));
        const settle = setTimeout(reposition, CONTROLS_SETTLE_MS);
        return () => clearTimeout(settle);
    });

    return {
        get linePercent() {
            return linePercent;
        },
        measure,
    };
}
