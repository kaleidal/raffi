import type { IptvChannel, IptvGroup, IptvParseResult } from "./types";
import { DEFAULT_IPTV_GROUP, parseQuotedAttributes, slugForId } from "./utils";

type PendingExtinf = {
    attributes: Record<string, string>;
    displayName: string;
};

function findExtinfDisplayNameComma(line: string): number {
    let quote: "\"" | "'" | null = null;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];

        if (char === "\\" && quote) {
            index += 1;
            continue;
        }

        if ((char === "\"" || char === "'") && (!quote || quote === char)) {
            quote = quote ? null : char;
            continue;
        }

        if (char === "," && !quote) {
            return index;
        }
    }

    return -1;
}

function parseExtinf(line: string): PendingExtinf {
    const commaIndex = findExtinfDisplayNameComma(line);
    const metadata = commaIndex >= 0 ? line.slice(0, commaIndex) : line;
    const displayName = commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : "";

    return {
        attributes: parseQuotedAttributes(metadata),
        displayName,
    };
}

function isPlayableUrl(line: string): boolean {
    if (!line) return false;
    if (line.startsWith("#")) return false;
    return true;
}

export function parseM3U(input: string, sourceId: string): IptvParseResult {
    const channels: IptvChannel[] = [];
    const groupOrder = new Map<string, number>();
    const groupCounts = new Map<string, number>();
    let pending: PendingExtinf | null = null;

    const lines = String(input ?? "").split(/\r?\n/);

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        if (line.startsWith("#EXTINF")) {
            pending = parseExtinf(line);
            continue;
        }

        if (!pending || !isPlayableUrl(line)) {
            continue;
        }

        const attributes = pending.attributes;
        const order = channels.length;
        const name =
            pending.displayName ||
            attributes["tvg-name"]?.trim() ||
            attributes["tvg-id"]?.trim() ||
            line;
        const group = attributes["group-title"]?.trim() || DEFAULT_IPTV_GROUP;

        if (!groupOrder.has(group)) {
            groupOrder.set(group, groupOrder.size);
        }
        groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);

        channels.push({
            id: `${sourceId}:${order}:${slugForId(name)}`,
            sourceId,
            name,
            url: line,
            group,
            tvgId: attributes["tvg-id"]?.trim() || undefined,
            tvgName: attributes["tvg-name"]?.trim() || undefined,
            logo: attributes["tvg-logo"]?.trim() || undefined,
            number:
                attributes["tvg-chno"]?.trim() ||
                attributes["channel-number"]?.trim() ||
                attributes["tvg-num"]?.trim() ||
                undefined,
            order,
        });

        pending = null;
    }

    const groups: IptvGroup[] = Array.from(groupOrder.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([name, order]) => ({
            id: `${sourceId}:group:${slugForId(name)}`,
            sourceId,
            name,
            channelCount: groupCounts.get(name) ?? 0,
            order,
        }));

    return { channels, groups };
}
