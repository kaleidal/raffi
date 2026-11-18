import { router } from "../stores/router";

const VIDEO_EXTENSIONS = /\.(mp4|m4v|mkv|avi|webm|mov|ts)$/i;

const isVideoFile = (file: File) => file.type.startsWith("video/") || VIDEO_EXTENSIONS.test(file.name);

const carriesFiles = (event: DragEvent) => Boolean(event.dataTransfer?.types.includes("Files"));

export function playLocalVideo(videoSrc: string) {
    router.navigate("player", { videoSrc, startTime: 0, metaData: null, fileIdx: null, season: null, episode: null });
}

/** Plays a video file dropped anywhere on the window. */
export function acceptDroppedVideos() {
    const allowDrop = (event: DragEvent) => {
        if (!carriesFiles(event) || event.defaultPrevented) return;
        event.preventDefault();
        event.dataTransfer!.dropEffect = "copy";
    };

    const playDropped = async (event: DragEvent) => {
        if (!carriesFiles(event) || event.defaultPrevented) return;
        event.preventDefault();
        const file = Array.from(event.dataTransfer!.files).find(isVideoFile);
        const videoSrc = file ? await window.electronAPI?.getPlayableFileUrl?.(file) : null;
        if (videoSrc) playLocalVideo(videoSrc);
    };

    window.addEventListener("dragover", allowDrop);
    window.addEventListener("drop", playDropped);
    return () => {
        window.removeEventListener("dragover", allowDrop);
        window.removeEventListener("drop", playDropped);
    };
}
