import type { ClientPlaybackController } from "../../../lib/media";

/** The two video surfaces, the pipeline playing on the visible one, and the source it was opened for. */
export class PlayerMedia {
    surfaceA = $state.raw<HTMLVideoElement>();
    surfaceB = $state.raw<HTMLVideoElement>();
    canvas = $state.raw<HTMLCanvasElement>();
    activeSurface = $state<0 | 1>(0);
    readonly video = $derived(this.activeSurface === 0 ? this.surfaceA : this.surfaceB);
    hls: any = null;
    controller: ClientPlaybackController | null = null;
    src = $state<string | null>(null);
    fileIdx = $state<number | null>(null);

    idle() {
        return (this.activeSurface === 0 ? this.surfaceB : this.surfaceA) ?? null;
    }

    swapSurfaces() {
        this.activeSurface = this.activeSurface === 0 ? 1 : 0;
    }
}
