export const DEFAULT_IPTV_GROUP = "Ungrouped";

export function normalizeIptvText(value: string | null | undefined): string {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "");
}

export function slugForId(value: string | null | undefined): string {
    const normalized = normalizeIptvText(value);
    return normalized || "channel";
}

export function parseQuotedAttributes(value: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const regex = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(value)) !== null) {
        attributes[match[1]] = match[2] ?? match[3] ?? "";
    }

    return attributes;
}
