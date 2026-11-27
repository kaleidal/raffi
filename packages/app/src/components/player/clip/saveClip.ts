import { createClip } from "../../../lib/shell/client";
import type { ClipRange } from "./clipTimeline";

const suggestedName = () => `clip_${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}.mp4`;

/** Exports the range, asking the desktop app where to put it; null when the save dialog was cancelled. */
export async function saveClip(source: string, { start, end }: ClipRange) {
    const choose = window.electronAPI?.saveClipPath;
    const chosen = choose ? await choose(suggestedName()) : null;
    if (chosen?.canceled) return null;

    const outputPath = chosen?.filePath ?? undefined;
    const { outputPath: saved } = await createClip({
        source,
        start,
        end,
        name: outputPath?.split(/[\\/]/).pop(),
        outputPath,
    });
    return saved;
}
