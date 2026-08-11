import { get } from "svelte/store";
import { trackEvent } from "../../lib/analytics";
import {
	audioTracks,
	currentAudioLabel,
	currentSubtitleLabel,
	currentTime,
	errorDetails,
	errorMessage,
	loading,
	loadingStage,
	playbackOffset,
	showAudioSelection,
	showError,
	showSubtitleSelection,
	showWatchPartyModal,
	subtitleTracks,
} from "./playerState";
import { getTrackAnalyticsProps } from "./playerAnalytics";
import * as Session from "./videoSession";
import * as Subtitles from "./subtitles";

export const createPlayerModalHandlers = ({
	getVideoElem,
	getCueLinePercent,
	getPlaybackAnalyticsProps,
	getVideoSrc,
	loadVideo,
	handleClose,
	getPlaybackController,
}: {
	getVideoElem: () => HTMLVideoElement | null | undefined;
	getCueLinePercent: () => number;
	getPlaybackAnalyticsProps: () => Record<string, unknown>;
	getVideoSrc: () => string | null;
	loadVideo: (src: string) => void | Promise<void>;
	handleClose: () => void | Promise<void>;
	getPlaybackController?: () => {
		seek: (time: number) => Promise<number>;
		setAudioTrack: (index: number, globalTime: number) => Promise<number>;
	} | null;
}) => {
	const onAudioSelect = (detail: unknown) => {
		trackEvent("audio_track_selected", {
			...getPlaybackAnalyticsProps(),
			...getTrackAnalyticsProps(detail, "audio"),
		});

		const videoElem = getVideoElem();
		if (!videoElem) return;

		void Session.handleAudioSelect(
			detail as import("./types").Track,
			get(audioTracks),
			get(currentTime),
			videoElem,
			{
				setAudioTracks: audioTracks.set,
				setCurrentAudioLabel: currentAudioLabel.set,
				setLoading: loading.set,
				setLoadingStage: loadingStage.set,
				setPlaybackOffset: playbackOffset.set,
			},
			getPlaybackController,
		);
	};

	const onSubtitleSelect = (detail: unknown) => {
		trackEvent("subtitle_selected", {
			...getPlaybackAnalyticsProps(),
			...getTrackAnalyticsProps(detail, "subtitles"),
		});

		const videoElem = getVideoElem();
		if (!videoElem) return;

		const track = detail as import("./types").Track;
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
			get(currentTime),
			get(playbackOffset),
			getCueLinePercent,
		);
	};

	const onSubtitleDelayChange = ({ seconds }: { seconds: number }) => {
		trackEvent("subtitle_delay_changed", {
			...getPlaybackAnalyticsProps(),
			delay_seconds: seconds,
		});

		const selected = get(subtitleTracks).find((track) => track.selected);
		if (!selected || selected.id === "off") return;

		const videoElem = getVideoElem();
		if (!videoElem) return;

		void Subtitles.handleSubtitleSelect(
			selected,
			videoElem,
			get(currentTime),
			get(playbackOffset),
			getCueLinePercent,
		);
	};

	const onErrorRetry = () => {
		trackEvent("player_error_retry", getPlaybackAnalyticsProps());
		showError.set(false);
		errorMessage.set("");
		errorDetails.set("");
		const src = getVideoSrc();
		if (src) {
			void loadVideo(src);
		}
	};

	const onErrorBack = () => {
		trackEvent("player_error_back", getPlaybackAnalyticsProps());
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
		onSubtitleDelayChange,
		onErrorRetry,
		onErrorBack,
		onCloseAudio,
		onCloseSubtitle,
		onCloseWatchParty,
		onFileSelected,
	};
};
