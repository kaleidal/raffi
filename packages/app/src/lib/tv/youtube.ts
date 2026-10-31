import { requestNative } from "./bridge";

/** Hands a video to the TV's YouTube app; false when the TV has none. */
export async function openInYouTube(videoId: string) {
	const { opened } = await requestNative<{ opened: boolean }>({ type: "youtube.open", videoId });
	return opened;
}
