import { get } from "svelte/store";
import {
	audioTracks,
	currentAudioLabel,
	currentSubtitleLabel,
	errorDetails,
	errorMessage,
	loading,
	loadingStage,
	showAudioSelection,
	showError,
	showSubtitleSelection,
	showWatchPartyModal,
	subtitleTracks,
} from "../playerState";
import * as Session from "../session/videoSession";
import * as Subtitles from "../subtitles/subtitles";

export const createPlayerModalHandlers = ({
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
				setCurrentAudioLabel: currentAudioLabel.set,
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
		subtitleTracks.update((tracks) =>
			tracks.map((entry) => ({
				...entry,
				selected: entry.id === track.id,
			})),
		);
		currentSubtitleLabel.set(track.label);
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
		currentSubtitleLabel.set(track.label);
		await Subtitles.handleSubtitleSelect(
			track,
			videoElem,
			getCueLinePercent,
		);
	};

	const onSubtitleDelayChange = () => {

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

	const onCloseAudio = () => showAudioSelection.set(false);
	const onCloseSubtitle = () => showSubtitleSelection.set(false);
	const onCloseWatchParty = () => showWatchPartyModal.set(false);

	const onFileSelected = (file: { path?: string } | null) => {
		if (file?.path) {
			void loadVideo(file.path);
		}
	};

	return {
		onAudioSelect,
		onSubtitleSelect,
		onSubtitleUpload,
		onSubtitleDelayChange,
		onErrorRetry,
		onErrorBack,
		onCloseAudio,
		onCloseSubtitle,
		onCloseWatchParty,
		onFileSelected,
	};
};
