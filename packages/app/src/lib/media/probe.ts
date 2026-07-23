import {
	ALL_FORMATS,
	Input,
	UrlSource,
	type AudioCodec,
	type InputAudioTrack,
	type InputVideoTrack,
	type VideoCodec,
} from "mediabunny";
import {
	listContainerAudioTracks,
	type ContainerAudioTrack,
} from "./containerTracks";
import { ensureMediaCodersRegistered } from "./registerCoders";

export type ProbedAudioTrack = {
	index: number;
	codec: AudioCodec | null;
	codecName: string | null;
	language: string | null;
	title: string | null;
	channels: number | null;
	/** False when the container lists it but MediaBunny cannot remux it. */
	playable: boolean;
	/** Index in MediaBunny's getAudioTracks() list, when playable. */
	bunnyIndex: number | null;
};

export type ProbedStream = {
	durationSeconds: number;
	video: {
		codec: VideoCodec | null;
		codecString: string | null;
		canDecode: boolean;
		width: number;
		height: number;
	} | null;
	audio: {
		codec: AudioCodec | null;
		codecString: string | null;
		canDecode: boolean;
		channels: number;
		sampleRate: number;
		language: string | null;
		title: string | null;
	} | null;
	audioTracks: ProbedAudioTrack[];
	preferredAudioIndex: number;
};

const NATIVE_AUDIO = new Set<AudioCodec | null>([
	"aac",
	"mp3",
	"opus",
	"flac",
	"vorbis",
]);

const LANGUAGE_LABELS: Record<string, string> = {
	eng: "English",
	en: "English",
	ita: "Italian",
	it: "Italian",
	spa: "Spanish",
	es: "Spanish",
	fre: "French",
	fra: "French",
	fr: "French",
	ger: "German",
	deu: "German",
	de: "German",
	por: "Portuguese",
	pt: "Portuguese",
	jpn: "Japanese",
	ja: "Japanese",
	kor: "Korean",
	ko: "Korean",
	chi: "Chinese",
	zho: "Chinese",
	zh: "Chinese",
	rus: "Russian",
	ru: "Russian",
	pol: "Polish",
	pl: "Polish",
	hun: "Hungarian",
	hu: "Hungarian",
	cze: "Czech",
	ces: "Czech",
	cs: "Czech",
	dut: "Dutch",
	nld: "Dutch",
	nl: "Dutch",
	swe: "Swedish",
	sv: "Swedish",
	nor: "Norwegian",
	no: "Norwegian",
	fin: "Finnish",
	fi: "Finnish",
	tur: "Turkish",
	tr: "Turkish",
	ara: "Arabic",
	ar: "Arabic",
	hin: "Hindi",
	hi: "Hindi",
	und: "Unknown",
};

export function createRemoteUrlSource(
	src: string,
	opts?: { parallelism?: number; maxCacheSize?: number },
) {
	return new UrlSource(src, {
		parallelism: opts?.parallelism ?? 2,
		maxCacheSize: opts?.maxCacheSize ?? 48 * 1024 * 1024,
	});
}

function createProbeUrlSource(src: string) {
	return createRemoteUrlSource(src, {
		parallelism: 2,
		maxCacheSize: 8 * 1024 * 1024,
	});
}

export function normalizeLang(lang: string | null | undefined): string {
	const value = (lang || "").trim().toLowerCase();
	if (!value || value === "und" || value === "null") return "";
	const short = value.slice(0, 3);
	if (short === "en" || short === "eng") return "eng";
	return short;
}

export function formatAudioTrackLabel(track: {
	title?: string | null;
	language?: string | null;
	codecName?: string | null;
	index: number;
}): string {
	const title = track.title?.trim() || "";
	// Prefer real titles except generic placeholders that hide the language.
	const genericTitle = /^(original|audio|track|default|und)$/i.test(title);
	if (title && !genericTitle) return title;

	const lang = normalizeLang(track.language);
	const langLabel = lang ? LANGUAGE_LABELS[lang] || lang.toUpperCase() : "";
	const codec = friendlyCodecName(track.codecName);

	if (langLabel && codec) return `${langLabel} (${codec})`;
	if (langLabel) return langLabel;
	if (title) return title;
	if (codec) return `Audio ${track.index} (${codec})`;
	return `Audio ${track.index}`;
}

export function preferredAudioIndex(tracks: ProbedAudioTrack[]): number {
	const engPlayable = tracks.findIndex(
		(track) => normalizeLang(track.language) === "eng" && track.playable,
	);
	if (engPlayable >= 0) return engPlayable;
	const playable = tracks.findIndex((track) => track.playable);
	if (playable >= 0) return playable;
	const eng = tracks.findIndex((track) => normalizeLang(track.language) === "eng");
	if (eng >= 0) return eng;
	return 0;
}

export async function probeRemoteStream(
	src: string,
	signal?: AbortSignal,
): Promise<{ input: Input; meta: ProbedStream }> {
	ensureMediaCodersRegistered();

	const input = new Input({
		source: createProbeUrlSource(src),
		formats: ALL_FORMATS,
	});

	const onAbort = () => {
		input.dispose();
	};
	signal?.addEventListener("abort", onAbort, { once: true });

	try {
		// Never scan the whole file for duration — that downloads the episode.
		const durationFromMeta = await input.getDurationFromMetadata();
		const durationSeconds =
			durationFromMeta != null &&
			Number.isFinite(durationFromMeta) &&
			durationFromMeta > 0
				? durationFromMeta
				: 0;

		const [videoTrack, audioTracks, primaryAudio] = await Promise.all([
			input.getPrimaryVideoTrack(),
			input.getAudioTracks(),
			input.getPrimaryAudioTrack(),
		]);

		const video = videoTrack ? await describeVideo(videoTrack) : null;
		const audio = primaryAudio ? await describeAudio(primaryAudio) : null;

		let listedAudio: ProbedAudioTrack[] = await Promise.all(
			audioTracks.map(async (track, index) => {
				const codec = await track.getCodec();
				const internalId = await track.getInternalCodecId();
				return {
					index,
					codec,
					codecName: codec || (typeof internalId === "string" ? internalId : null),
					language: (await track.getLanguageCode()) || null,
					title: (await track.getName()) || null,
					channels: await track.getNumberOfChannels(),
					playable: true,
					bunnyIndex: index,
				};
			}),
		);

		if (listedAudio.length === 0 && primaryAudio) {
			const codec = await primaryAudio.getCodec();
			const internalId = await primaryAudio.getInternalCodecId();
			listedAudio = [
				{
					index: 0,
					codec,
					codecName: codec || (typeof internalId === "string" ? internalId : null),
					language: (await primaryAudio.getLanguageCode()) || null,
					title: (await primaryAudio.getName()) || null,
					channels: await primaryAudio.getNumberOfChannels(),
					playable: true,
					bunnyIndex: 0,
				},
			];
		}

		const meta = ensureAudioTracks({
			durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
			video,
			audio,
			audioTracks: listedAudio,
			preferredAudioIndex: preferredAudioIndex(listedAudio),
		});

		return { input, meta };
	} catch (error) {
		input.dispose();
		throw error;
	} finally {
		signal?.removeEventListener("abort", onAbort);
	}
}

/** Enrich track list from container headers without blocking first playback. */
export async function enrichProbedStreamAudio(
	src: string,
	meta: ProbedStream,
	signal?: AbortSignal,
): Promise<ProbedStream> {
	try {
		const containerTracks = await listContainerAudioTracks(src, signal);
		return ensureAudioTracks(mergeContainerAudioTracks(meta, containerTracks));
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			throw error;
		}
		console.warn("Container audio track listing failed", error);
		return meta;
	}
}

/** Prefer a non-empty track list so the Audio modal is never blank while sound plays. */
export function ensureAudioTracks(meta: ProbedStream): ProbedStream {
	if (meta.audioTracks.length > 0) {
		return {
			...meta,
			preferredAudioIndex: preferredAudioIndex(meta.audioTracks),
		};
	}
	if (!meta.audio) return meta;

	const track: ProbedAudioTrack = {
		index: 0,
		codec: meta.audio.codec,
		codecName: meta.audio.codec,
		language: meta.audio.language,
		title: meta.audio.title,
		channels: meta.audio.channels,
		playable: true,
		bunnyIndex: 0,
	};
	return {
		...meta,
		audioTracks: [track],
		preferredAudioIndex: 0,
	};
}

function mergeContainerAudioTracks(
	meta: ProbedStream,
	containerTracks: ContainerAudioTrack[],
): ProbedStream {
	if (containerTracks.length === 0) return meta;

	const bunny = meta.audioTracks;

	if (containerTracks.length > bunny.length) {
		const usedBunny = new Set<number>();
		const merged: ProbedAudioTrack[] = containerTracks.map((stream, index) => {
			const match = findMatchingBunnyTrack(bunny, stream, index, usedBunny);
			if (match) usedBunny.add(match.index);
			const playable =
				match != null ||
				(bunny.length === 0 && index === 0 && meta.audio != null);
			return {
				index,
				codec: match?.codec ?? mapContainerCodec(stream.codecId),
				codecName: stream.codecId || match?.codecName || null,
				language: stream.language || match?.language || null,
				title: stream.title || match?.title || null,
				channels: stream.channels ?? match?.channels ?? null,
				playable,
				bunnyIndex: match?.index ?? (playable ? 0 : null),
			};
		});

		return {
			...meta,
			audioTracks: merged,
			preferredAudioIndex: preferredAudioIndex(merged),
		};
	}

	const enriched = bunny.map((track, index) => {
		const stream = containerTracks[index];
		if (!stream) return track;
		return {
			...track,
			language: track.language || stream.language || null,
			title: track.title || stream.title || null,
			channels: track.channels ?? stream.channels ?? null,
			codecName: track.codecName || stream.codecId || null,
		};
	});

	return {
		...meta,
		audioTracks: enriched,
		preferredAudioIndex: preferredAudioIndex(enriched),
	};
}

function findMatchingBunnyTrack(
	bunnyTracks: ProbedAudioTrack[],
	stream: ContainerAudioTrack,
	containerIndex: number,
	usedBunny: Set<number>,
): ProbedAudioTrack | null {
	const lang = normalizeLang(stream.language);
	const title = (stream.title || "").trim().toLowerCase();
	const codec = normalizeCodecId(stream.codecId);

	const scored = bunnyTracks
		.filter((track) => !usedBunny.has(track.index))
		.map((track) => {
			let score = 0;
			const trackLang = normalizeLang(track.language);
			const trackTitle = (track.title || "").trim().toLowerCase();
			const trackCodec = normalizeCodecId(track.codecName || track.codec);

			if (lang && trackLang && lang === trackLang) score += 4;
			if (title && trackTitle && title === trackTitle) score += 3;
			if (codec && trackCodec && codecsCompatible(codec, trackCodec)) score += 2;
			if (track.index === containerIndex) score += 1;
			if (
				stream.channels != null &&
				track.channels != null &&
				track.channels === stream.channels
			) {
				score += 1;
			}
			return { track, score };
		});

	scored.sort((a, b) => b.score - a.score);
	const best = scored[0];
	if (!best) return null;
	if (best.score >= 2) return best.track;
	return bunnyTracks[containerIndex] && !usedBunny.has(containerIndex)
		? bunnyTracks[containerIndex]!
		: null;
}

function normalizeCodecId(value: string | AudioCodec | null | undefined): string {
	return (value || "").toString().trim().toLowerCase().replace(/^a_/, "");
}

function codecsCompatible(a: string, b: string): boolean {
	if (!a || !b) return false;
	if (a === b) return true;
	if (a.includes(b) || b.includes(a)) return true;
	const aliases: Record<string, string[]> = {
		eac3: ["eac3", "ec-3", "a_eac3"],
		ac3: ["ac3", "ac-3", "a_ac3"],
		aac: ["aac", "mp4a", "a_aac"],
		mp3: ["mp3", "mpeg/l3", "a_mpeg/l3"],
		opus: ["opus", "a_opus"],
		flac: ["flac", "a_flac"],
	};
	for (const group of Object.values(aliases)) {
		const aHit = group.some((item) => a.includes(item.replace(/^a_/, "")));
		const bHit = group.some((item) => b.includes(item.replace(/^a_/, "")));
		if (aHit && bHit) return true;
	}
	return false;
}

function mapContainerCodec(codecId: string | null): AudioCodec | null {
	if (!codecId) return null;
	const id = codecId.toUpperCase();
	if (id.startsWith("A_AAC") || id === "MP4A") return "aac";
	if (id.includes("MPEG/L3") || id === "MP3") return "mp3";
	if (id.includes("OPUS")) return "opus";
	if (id.includes("VORBIS")) return "vorbis";
	if (id.includes("FLAC")) return "flac";
	if (id === "A_AC3" || id === "AC-3") return "ac3";
	if (id === "A_EAC3" || id === "EC-3") return "eac3";
	return null;
}

function friendlyCodecName(codecName: string | null | undefined): string {
	if (!codecName) return "";
	const id = codecName.toUpperCase();
	if (id.includes("EAC3") || id.includes("EC-3")) return "E-AC-3";
	if (id.includes("AC3") || id.includes("AC-3")) return "AC-3";
	if (id.includes("TRUEHD") || id.includes("MLP")) return "TrueHD";
	if (id.includes("DTS")) return "DTS";
	if (id.includes("AAC") || id === "MP4A") return "AAC";
	if (id.includes("OPUS")) return "Opus";
	if (id.includes("FLAC")) return "FLAC";
	if (id.includes("MPEG/L3") || id === "MP3") return "MP3";
	return codecName;
}

async function describeVideo(track: InputVideoTrack) {
	const codec = await track.getCodec();
	return {
		codec,
		codecString: await track.getCodecParameterString(),
		// Skip expensive decoder probes for codecs MSE already accepts.
		canDecode: isMseFriendlyVideo(codec) ? true : await track.canDecode(),
		width: await track.getDisplayWidth(),
		height: await track.getDisplayHeight(),
	};
}

async function describeAudio(track: InputAudioTrack) {
	const codec = await track.getCodec();
	return {
		codec,
		codecString: await track.getCodecParameterString(),
		canDecode: NATIVE_AUDIO.has(codec) ? true : await track.canDecode(),
		channels: await track.getNumberOfChannels(),
		sampleRate: await track.getSampleRate(),
		language: (await track.getLanguageCode()) || null,
		title: (await track.getName()) || null,
	};
}

export function isNativeFriendlyAudio(
	codec: AudioCodec | null,
	supportsEac3: boolean,
): boolean {
	if (NATIVE_AUDIO.has(codec)) return true;
	if (supportsEac3 && (codec === "eac3" || codec === "ac3")) return true;
	return false;
}

export function isMseFriendlyVideo(codec: VideoCodec | null): boolean {
	return (
		codec === "avc" ||
		codec === "hevc" ||
		codec === "av1" ||
		codec === "vp9" ||
		codec === "vp8"
	);
}
