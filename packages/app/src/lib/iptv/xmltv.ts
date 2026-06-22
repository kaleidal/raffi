import type { IptvChannel, XmltvGuide, XmltvProgramme } from "./types";
import { normalizeIptvText, parseQuotedAttributes } from "./utils";

function decodeXmlEntities(value: string): string {
    return value.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (match, entity) => {
        switch (entity) {
            case "amp":
                return "&";
            case "lt":
                return "<";
            case "gt":
                return ">";
            case "quot":
                return "\"";
            case "apos":
                return "'";
            default: {
                const raw = String(entity);
                const isHex = raw.toLowerCase().startsWith("#x");
                const numeric = raw.startsWith("#")
                    ? Number.parseInt(raw.slice(isHex ? 2 : 1), isHex ? 16 : 10)
                    : Number.NaN;
                return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : match;
            }
        }
    });
}

function getTagText(block: string, tagName: string): string | undefined {
    const regex = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
    const match = regex.exec(block);
    if (!match) return undefined;
    const text = getXmlTextContent(match[1]);
    return text || undefined;
}

function getAllTagText(block: string, tagName: string): string[] {
    const values: string[] = [];
    const regex = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(block)) !== null) {
        const text = getXmlTextContent(match[1]);
        if (text) values.push(text);
    }

    return values;
}

function getXmlTextContent(value: string): string {
    let output = "";
    let cursor = 0;
    const cdataRegex = /<!\[CDATA\[([\s\S]*?)\]\]>/gi;
    let match: RegExpExecArray | null;

    while ((match = cdataRegex.exec(value)) !== null) {
        output += decodeXmlEntities(value.slice(cursor, match.index).replace(/<[^>]+>/g, ""));
        output += match[1];
        cursor = cdataRegex.lastIndex;
    }

    output += decodeXmlEntities(value.slice(cursor).replace(/<[^>]+>/g, ""));
    return output.trim();
}

export function parseXmltvTime(value: string): Date {
    const match = String(value ?? "").trim().match(
        /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?/,
    );

    if (!match) {
        throw new Error("Invalid XMLTV time");
    }

    const [, year, month, day, hour, minute, second, sign, offsetHour, offsetMinute] = match;
    const utc = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
    );

    if (!sign) return new Date(utc);

    const offsetMs =
        (Number(offsetHour) * 60 + Number(offsetMinute)) *
        60 *
        1000 *
        (sign === "+" ? 1 : -1);

    return new Date(utc - offsetMs);
}

function countProgrammes(guide: XmltvGuide): number {
    let count = 0;
    for (const programmes of guide.programmesByChannel.values()) {
        count += programmes.length;
    }
    return count;
}

export function getProgrammeCount(guide: XmltvGuide | undefined): number {
    return guide ? countProgrammes(guide) : 0;
}

export function parseXmltv(xml: string): XmltvGuide {
    const text = String(xml ?? "");
    if (!/<tv\b/i.test(text)) {
        throw new Error("Invalid XMLTV document");
    }

    const guide: XmltvGuide = {
        channels: new Map(),
        programmesByChannel: new Map(),
        displayNameToChannelId: new Map(),
    };

    const channelRegex = /<channel\b([^>]*)>([\s\S]*?)<\/channel>/gi;
    let channelMatch: RegExpExecArray | null;

    while ((channelMatch = channelRegex.exec(text)) !== null) {
        const attributes = parseQuotedAttributes(channelMatch[1]);
        const id = attributes.id?.trim();
        if (!id) continue;

        const displayNames = getAllTagText(channelMatch[2], "display-name");
        guide.channels.set(id, { id, displayNames });

        for (const displayName of displayNames) {
            const key = normalizeIptvText(displayName);
            if (key && !guide.displayNameToChannelId.has(key)) {
                guide.displayNameToChannelId.set(key, id);
            }
        }
    }

    const programmeRegex = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
    let programmeMatch: RegExpExecArray | null;

    while ((programmeMatch = programmeRegex.exec(text)) !== null) {
        const attributes = parseQuotedAttributes(programmeMatch[1]);
        const channelId = attributes.channel?.trim();
        const startRaw = attributes.start?.trim();
        const stopRaw = attributes.stop?.trim();
        if (!channelId || !startRaw || !stopRaw) continue;

        const title = getTagText(programmeMatch[2], "title") || "Untitled";
        const programme: XmltvProgramme = {
            channelId,
            start: parseXmltvTime(startRaw),
            stop: parseXmltvTime(stopRaw),
            title,
            subTitle: getTagText(programmeMatch[2], "sub-title"),
            description: getTagText(programmeMatch[2], "desc"),
        };

        const programmes = guide.programmesByChannel.get(channelId) ?? [];
        programmes.push(programme);
        guide.programmesByChannel.set(channelId, programmes);
    }

    for (const programmes of guide.programmesByChannel.values()) {
        programmes.sort((a, b) => a.start.getTime() - b.start.getTime());
    }

    return guide;
}

function resolveGuideChannelId(channel: IptvChannel, guide: XmltvGuide): string | null {
    if (channel.tvgId && guide.channels.has(channel.tvgId)) {
        return channel.tvgId;
    }

    const tvgName = normalizeIptvText(channel.tvgName);
    if (tvgName && guide.displayNameToChannelId.has(tvgName)) {
        return guide.displayNameToChannelId.get(tvgName) ?? null;
    }

    const displayName = normalizeIptvText(channel.name);
    if (displayName && guide.displayNameToChannelId.has(displayName)) {
        return guide.displayNameToChannelId.get(displayName) ?? null;
    }

    return null;
}

export function getNowNext(
    channel: IptvChannel,
    guide: XmltvGuide,
    at: Date = new Date(),
): { now: XmltvProgramme | null; next: XmltvProgramme | null } {
    const guideChannelId = resolveGuideChannelId(channel, guide);
    if (!guideChannelId) {
        return { now: null, next: null };
    }

    const programmes = guide.programmesByChannel.get(guideChannelId) ?? [];
    const timestamp = at.getTime();
    let now: XmltvProgramme | null = null;
    let next: XmltvProgramme | null = null;

    for (const programme of programmes) {
        const start = programme.start.getTime();
        const stop = programme.stop.getTime();

        if (start <= timestamp && timestamp < stop) {
            now = programme;
            continue;
        }

        if (start > timestamp) {
            next = programme;
            break;
        }
    }

    return { now, next };
}
