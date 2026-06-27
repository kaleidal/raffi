import { iptvFetchText, type IptvFetchText } from "./fetch";
import { parseM3U } from "./m3u";
import type { IptvRefreshResult, IptvSource, XmltvGuide } from "./types";
import { buildXtreamPlaylistUrl, buildXtreamXmltvUrl } from "./xtream";
import { getProgrammeCount, parseXmltv } from "./xmltv";

export type RefreshIptvSourceOptions = {
    fetchText?: IptvFetchText;
    now?: () => Date;
};

const M3U_TIMEOUT_MS = 20_000;
const XMLTV_TIMEOUT_MS = 60_000;
const MAX_BYTES = 64 * 1024 * 1024;

function getPlaylistUrl(source: IptvSource): string {
    return source.kind === "xtream" ? buildXtreamPlaylistUrl(source) : source.m3uUrl;
}

function getGuideUrl(source: IptvSource): string | undefined {
    return source.kind === "xtream" ? buildXtreamXmltvUrl(source) : source.epgUrl;
}

function friendlyFetchError(error: unknown, label: string): Error {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`${label} could not be loaded. ${message}`);
}

export async function refreshIptvSource(
    source: IptvSource,
    options: RefreshIptvSourceOptions = {},
): Promise<IptvRefreshResult> {
    const fetchText = options.fetchText ?? iptvFetchText;
    const now = options.now ?? (() => new Date());

    let playlist: string;
    const playlistUrl = getPlaylistUrl(source);
    try {
        playlist = await fetchText(playlistUrl, {
            timeoutMs: M3U_TIMEOUT_MS,
            maxBytes: MAX_BYTES,
        });
    } catch (error) {
        throw friendlyFetchError(error, "The IPTV playlist");
    }

    const parsed = parseM3U(playlist, source.id);
    if (parsed.channels.length === 0) {
        throw new Error("The IPTV playlist did not contain any channels");
    }

    let guide: XmltvGuide | undefined;
    const guideUrl = getGuideUrl(source);
    if (guideUrl) {
        let xmltv: string;
        try {
            xmltv = await fetchText(guideUrl, {
                timeoutMs: XMLTV_TIMEOUT_MS,
                maxBytes: MAX_BYTES,
            });
        } catch (error) {
            throw friendlyFetchError(error, "The XMLTV guide");
        }

        try {
            guide = parseXmltv(xmltv);
        } catch {
            throw new Error("The XMLTV guide could not be parsed");
        }
    }

    return {
        channels: parsed.channels,
        groups: parsed.groups,
        guide,
        loadedAt: now().toISOString(),
        stats: {
            channelCount: parsed.channels.length,
            groupCount: parsed.groups.length,
            programmeCount: getProgrammeCount(guide),
        },
    };
}
