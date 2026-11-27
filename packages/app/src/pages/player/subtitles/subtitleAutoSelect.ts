import { findSubtitleInLanguage, readSubtitlePreference } from "./subtitlePreference";

const playingAudioLanguage = (sessionData: any): string | null => {
    const audioIndex = Number.isFinite(sessionData?.audioIndex) ? Number(sessionData.audioIndex) : 0;
    const streams = Array.isArray(sessionData?.availableStreams) ? sessionData.availableStreams : [];
    const audio = streams.find((stream: any) => stream?.type === "audio" && stream?.index === audioIndex);
    return audio?.language || audio?.title?.split(" ")[0] || null;
};

export const autoEnableDefaultSubtitles = async ({
    sessionData,
    subtitleTracksValue,
    videoElem,
    cueLinePercent,
    setSubtitleTracks,
    handleSubtitleSelect,
}: {
    sessionData: any;
    subtitleTracksValue: any[];
    videoElem: HTMLVideoElement | undefined;
    cueLinePercent: number;
    setSubtitleTracks: (updater: (tracks: any[]) => any[]) => void;
    handleSubtitleSelect: (
        track: any,
        videoElem: HTMLVideoElement,
        getCueLinePercent: () => number,
    ) => Promise<void> | void;
}) => {
    if (!subtitleTracksValue || subtitleTracksValue.length === 0) return;

    const alreadySelected = subtitleTracksValue.find((track: any) => track?.selected);
    if (alreadySelected && String(alreadySelected.id) !== "off") return;

    const preference = readSubtitlePreference();
    if (preference?.enabled === false) return;

    const picked =
        findSubtitleInLanguage(subtitleTracksValue, preference?.lang) ??
        findSubtitleInLanguage(subtitleTracksValue, playingAudioLanguage(sessionData)) ??
        findSubtitleInLanguage(subtitleTracksValue, "en");

    if (!picked || !videoElem) return;

    setSubtitleTracks((all) =>
        all.map((track: any) => ({
            ...track,
            selected: String(track?.id) === String(picked.id),
        })),
    );

    await handleSubtitleSelect(picked, videoElem, () => cueLinePercent);
};
