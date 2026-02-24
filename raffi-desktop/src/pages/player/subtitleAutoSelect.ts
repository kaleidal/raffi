const normalizeLang = (raw?: string | null): string | null => {
    if (!raw) return null;
    const value = String(raw).toLowerCase().trim();
    if (!value) return null;

    if (value === "en" || value === "eng" || value === "english") return "en";
    if (value === "ja" || value === "jpn" || value === "japanese") return "ja";
    if (value === "es" || value === "spa" || value === "spanish") return "es";
    if (value === "fr" || value === "fra" || value === "fre" || value === "french") return "fr";
    if (value === "de" || value === "deu" || value === "ger" || value === "german") return "de";

    if (/^[a-z]{2}$/.test(value)) return value;
    if (/^[a-z]{3}$/.test(value)) return value;

    const match2 = value.match(/\b[a-z]{2}\b/);
    if (match2?.[0]) return match2[0];

    const match3 = value.match(/\b[a-z]{3}\b/);
    if (match3?.[0]) return match3[0];

    return null;
};

const getPreferredSubtitleLang = (sessionData: any): string | null => {
    const audioIndex = Number.isFinite(sessionData?.audioIndex)
        ? Number(sessionData.audioIndex)
        : 0;
    const streams = Array.isArray(sessionData?.availableStreams)
        ? sessionData.availableStreams
        : [];
    const audioStream = streams.find(
        (stream: any) => stream?.type === "audio" && stream?.index === audioIndex,
    );
    return normalizeLang(audioStream?.language || audioStream?.title);
};

export const autoEnableDefaultSubtitles = async ({
    sessionData,
    subtitleTracksValue,
    videoElem,
    currentTime,
    playbackOffset,
    cueLinePercent,
    setSubtitleTracks,
    setCurrentSubtitleLabel,
    handleSubtitleSelect,
}: {
    sessionData: any;
    subtitleTracksValue: any[];
    videoElem: HTMLVideoElement | undefined;
    currentTime: number;
    playbackOffset: number;
    cueLinePercent: number;
    setSubtitleTracks: (updater: (tracks: any[]) => any[]) => void;
    setCurrentSubtitleLabel: (label: string) => void;
    handleSubtitleSelect: (
        track: any,
        videoElem: HTMLVideoElement,
        currentTime: number,
        playbackOffset: number,
        getCueLinePercent: () => number,
    ) => Promise<void> | void;
}) => {
    if (!subtitleTracksValue || subtitleTracksValue.length === 0) return;

    const alreadySelected = subtitleTracksValue.find((track: any) => track?.selected);
    if (alreadySelected && String(alreadySelected.id) !== "off") return;

    const preferredLang = getPreferredSubtitleLang(sessionData);
    const candidates = subtitleTracksValue.filter((track: any) => String(track?.id) !== "off");
    if (candidates.length === 0) return;

    const findByLang = (lang: string) =>
        candidates.find((track: any) => normalizeLang(track?.lang) === lang);

    const picked =
        (preferredLang ? findByLang(preferredLang) : undefined) ||
        findByLang("en");

    if (!picked || !videoElem) return;

    setSubtitleTracks((all) =>
        all.map((track: any) => ({
            ...track,
            selected: String(track?.id) === String(picked.id),
        })),
    );
    setCurrentSubtitleLabel(picked.label);

    await handleSubtitleSelect(
        picked,
        videoElem,
        currentTime,
        playbackOffset,
        () => cueLinePercent,
    );
};
