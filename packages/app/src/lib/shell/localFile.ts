import { router } from "../stores/router";

const VIDEO_FILE_TYPES = "video/*,.mkv,.mp4,.avi,.mov,.webm";

export function playLocalFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = VIDEO_FILE_TYPES;
    input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        const videoSrc = await window.electronAPI?.getPlayableFileUrl?.(file);
        if (!videoSrc) return;
        router.navigate("player", { videoSrc, startTime: 0, metaData: null, fileIdx: null, season: null, episode: null });
    });
    input.click();
}
