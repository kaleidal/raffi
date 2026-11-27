import { FULL_FRAME, type ContentRect } from "../../../../lib/media/crop/barDetection";
import { detectBars } from "../../../../lib/media/crop/sampleBars";
import type { SeekPreview } from "../../../../lib/media/preview/seekPreview";

/** Finds the black bars baked into the playing video, once per source, so only the picture is shown. */
export function createAutocrop({
    getPreview,
    getDuration,
}: {
    getPreview: () => SeekPreview | null;
    getDuration: () => number;
}) {
    let found = $state.raw<{ source: SeekPreview; rect: ContentRect } | null>(null);
    let examined: SeekPreview | null = null;

    $effect(() => {
        const preview = getPreview();
        const duration = getDuration();
        if (!preview || !(duration > 0) || examined === preview) return;
        examined = preview;
        void detectBars(preview, duration).then((rect) => {
            if (rect && getPreview() === preview) found = { source: preview, rect };
        });
    });

    return {
        get rect(): ContentRect {
            return found && found.source === getPreview() ? found.rect : FULL_FRAME;
        },
    };
}
