import { languageCode } from "../utils/languages";

export const PROVIDER_KEYWORDS = [
    "TorrentGalaxy",
    "Torrentio",
    "RARBG",
    "ThePirateBay",
    "1337x",
    "Torlock",
    "YTS",
    "EZTV",
    "TorrentLeech",
    "Zooqle",
    "Nyaa",
    "AniDex",
    "MediaFusion",
    "Bitsearch",
    "MagnetDL",
    "LimeTorrents",
    "TorrentSeed",
    "Glotorrents",
    "Demonoid",
    "ByteSearch",
];

export const AVAILABILITY_MAP: Record<string, string> = {
    RD: "Real-Debrid",
    "RD+": "Real-Debrid+",
    AD: "AllDebrid",
    PM: "Premiumize",
};

export interface DebridAvailability {
    serviceLabel: string | null;
    dashboardUrl: string | null;
    isCached: boolean | null;
}

const DEBRID_SERVICES: Record<string, { label: string; dashboardUrl: string }> = {
    TB: { label: "TorBox", dashboardUrl: "https://www.torbox.app/dashboard" },
    RD: { label: "Real-Debrid", dashboardUrl: "https://real-debrid.com/torrents" },
    AD: { label: "AllDebrid", dashboardUrl: "https://alldebrid.com/magnets/" },
    PM: { label: "Premiumize", dashboardUrl: "https://www.premiumize.me/transfers" },
};

export function parseDebridAvailability(token: string | null | undefined): DebridAvailability {
    const normalized = String(token ?? "").toUpperCase();
    const serviceCode = normalized.match(/\b(TB|RD|AD|PM)\+?\b/)?.[1] ?? null;
    const service = serviceCode ? DEBRID_SERVICES[serviceCode] : null;
    const isCached = !token
        ? null
        : /\u26a1|\+|CACHED/i.test(token)
            ? true
            : /\u2b07|UNCACHED/i.test(token)
                ? false
                : null;

    return {
        serviceLabel: service?.label ?? null,
        dashboardUrl: service?.dashboardUrl ?? null,
        isCached,
    };
}

const FLAG_EMOJI_REGEX = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;
const COUNTRY_TO_LANG: Record<string, string> = {
    GB: "EN", IT: "IT", ES: "ES", FR: "FR", DE: "DE",
    PT: "PT", RU: "RU", JP: "JA", KR: "KO", CN: "ZH",
    IN: "HI", SA: "AR", TR: "TR", NL: "NL", PL: "PL",
    SE: "SV", NO: "NO", DK: "DA", FI: "FI", CZ: "CS",
    GR: "EL", IL: "HE", VN: "VI", TH: "TH", ID: "ID",
    MY: "MS", UA: "UK", RO: "RO", HU: "HU", BG: "BG",
    RS: "SR", HR: "HR", SK: "SK", SI: "SL", IR: "FA",
    PK: "UR",
};

const flagEmojiToLanguageCode = (flag: string): string | null => {
    const chars = Array.from(flag);
    if (chars.length !== 2) return null;
    const points = chars.map((char) => char.codePointAt(0) ?? 0);
    for (const point of points) {
        if (point < 0x1f1e6 || point > 0x1f1ff) return null;
    }
    const countryCode = points
        .map((point) => String.fromCharCode(point - 0x1f1e6 + 65))
        .join("");

    return COUNTRY_TO_LANG[countryCode] || countryCode;
};

export const extractAudioLanguageCodes = (
    description: string | null | undefined,
    filename: string | null | undefined = null,
): string[] => {
    const codes: string[] = [];
    const seen = new Set<string>();
    const add = (code: string | null | undefined) => {
        if (!code || seen.has(code)) return;
        seen.add(code);
        codes.push(code);
    };

    for (const flag of String(description ?? "").match(FLAG_EMOJI_REGEX) || []) {
        add(flagEmojiToLanguageCode(flag));
    }

    const filenameTokens = String(filename ?? "")
        .toUpperCase()
        .split(/[^A-Z]+/)
        .filter(Boolean);
    const mappedTokens = filenameTokens.map(languageCode);

    mappedTokens.forEach((code, index) => {
        if (!code) return;
        const token = filenameTokens[index];
        const isLongCode = token.length >= 3;
        const isPartOfLanguageRun = Boolean(mappedTokens[index - 1] || mappedTokens[index + 1]);
        if (isLongCode || isPartOfLanguageRun) add(code);
    });

    return codes;
};

const PROVIDER_PATTERNS = PROVIDER_KEYWORDS.map(keyword => ({
    keyword,
    pattern: new RegExp(keyword.replace(/\s+/g, "\\s*"), "i")
}));

export const detectProvider = (text: string | null): string | null => {
    if (!text) return null;
    for (const {keyword, pattern} of PROVIDER_PATTERNS) {
        if (pattern.test(text)) {
            return keyword;
        }
    }

    const tokens = text
        .split(/[|•\-\s]+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .reverse();

    return (
        tokens.find((token) => {
            if (!/^[A-Za-z][A-Za-z0-9.+-]{2,}$/.test(token)) return false;
            if (/(GB|MB|TB)$/i.test(token)) return false;
            if (/\d+p$/i.test(token)) return false;
            if (/HDR|SDR|HEVC|H\.?(?:26[45])|AV1|ATMOS|DDP|DTS|TRUEHD|AAC|FLAC/i.test(token))
                return false;
            if (/BLU-?RAY|BDRIP|WEB-?DL|WEBRIP|WEBMUX|REMUX|HDTV|DVD-?RIP|HDCAM/i.test(token))
                return false;
            if (languageCode(token))
                return false;
            return true;
        }) || null
    );
};

export const parsePeerCount = (text: string | null): number | null => {
    if (!text) return null;

    const emojiMatch = text.match(/(?:👤|👥)\s*(\d{1,5})/);
    if (emojiMatch) {
        const value = parseInt(emojiMatch[1], 10);
        if (!Number.isNaN(value)) return value;
    }

    const peerMatch = text.match(/(\d{1,5})\s*(?:peers?|seeders?|seeds?)/i);
    if (peerMatch) {
        const value = parseInt(peerMatch[1], 10);
        if (!Number.isNaN(value)) return value;
    }

    const leadingMatch = text.trim().match(/^(\d{1,4})(?=\s)/);
    if (leadingMatch) {
        const value = parseInt(leadingMatch[1], 10);
        if (!Number.isNaN(value)) return value;
    }

    return null;
};

export const formatAvailability = (label: string | null): string | null => {
    if (!label) return null;
    const normalized = label.replace(/[[\]]/g, "").toUpperCase();
    return AVAILABILITY_MAP[normalized] ?? normalized;
};
