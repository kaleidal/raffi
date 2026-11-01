import { requestNative } from "./bridge";

/** Hands a video to the device's YouTube app; false when it has none. */
export async function openInYouTube(videoId: string) {
	const { opened } = await requestNative<{ opened: boolean }>({ type: "youtube.open", videoId });
	return opened;
}
