import { get } from "svelte/store";
import {
	audioTracks,
	errorDetails,
	errorMessage,
	loading,
	loadingStage,
	showError,
	subtitleTracks,
} from "../playerState";
import * as Session from "../session/videoSession";
import * as Subtitles from "../subtitles/subtitles";
import { rememberSubtitleChoice } from "../subtitles/subtitlePreference";

/** What the player's track panel and error screen do. */
export const createPlayerActions = ({
	getVideoElem,
	getCueLinePercent,
	getVideoSrc,
	loadVideo,
	handleClose,
	getPlaybackController,
}: {
	getVideoElem: () => HTMLVideoElement | null | undefined;
	getCueLinePercent: () => number;
	getVideoSrc: () => string | null;
	loadVideo: (src: string) => void | Promise<void>;
	handleClose: () => void | Promise<void>;
	getPlaybackController: () => {
		setAudioTrack: (index: number, time: number) => Promise<void>;
	} | null;
}) => {
	const onAudioSelect = (detail: unknown) => {
		const videoElem = getVideoElem();
		if (!videoElem) return;

		void Session.handleAudioSelect(
			detail as import("../types").Track,
			get(audioTracks),
			videoElem,
			{
				setAudioTracks: audioTracks.set,
				setLoading: loading.set,
				setLoadingStage: loadingStage.set,
			},
			getPlaybackController,
		);
	};

	const onSubtitleSelect = (detail: unknown) => {
		const videoElem = getVideoElem();
		if (!videoElem) return;

		const track = detail as import("../types").Track;
		rememberSubtitleChoice(track);
		subtitleTracks.update((tracks) =>
			tracks.map((entry) => ({
				...entry,
				selected: entry.id === track.id,
			})),
		);
		void Subtitles.handleSubtitleSelect(
			track,
			videoElem,
			getCueLinePercent,
		);
	};

	const onSubtitleUpload = async (file: File) => {
		const videoElem = getVideoElem();
		if (!videoElem) {
			throw new Error("The player is not ready for subtitles yet.");
		}

		const track = await Subtitles.createUploadedSubtitleTrack(file);
		subtitleTracks.update((tracks) => [
			...tracks.map((entry) => ({ ...entry, selected: false })),
			{ ...track, selected: true },
		]);
		await Subtitles.handleSubtitleSelect(
			track,
			videoElem,
			getCueLinePercent,
		);
	};

	const onSubtitleDelayChange = (seconds: number) => {
		Subtitles.setSubtitleDelaySeconds(seconds);
		const selected = get(subtitleTracks).find((track) => track.selected);
		if (!selected || selected.id === "off") return;

		const videoElem = getVideoElem();
		if (!videoElem) return;

		void Subtitles.handleSubtitleSelect(
			selected,
			videoElem,
			getCueLinePercent,
		);
	};

	const onErrorRetry = () => {
		showError.set(false);
		errorMessage.set("");
		errorDetails.set("");
		const src = getVideoSrc();
		if (src) {
			void loadVideo(src);
		}
	};

	const onErrorBack = () => {
		showError.set(false);
		void handleClose();
	};

	return {
		onAudioSelect,
		onSubtitleSelect,
		onSubtitleUpload,
		onSubtitleDelayChange,
		subtitleDelay: Subtitles.getSubtitleDelaySeconds,
		onErrorRetry,
		onErrorBack,
	};
};
