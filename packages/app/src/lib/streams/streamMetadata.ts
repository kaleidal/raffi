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

type LanguageTag = {
    code: string;
    flag?: string;
};

const LANGUAGE_ALIAS_TO_TAG: Record<string, LanguageTag> = {
    EN: { code: "EN", flag: "🇬🇧" },
    ENG: { code: "EN", flag: "🇬🇧" },
    ENGLISH: { code: "EN", flag: "🇬🇧" },
    IT: { code: "IT", flag: "🇮🇹" },
    ITA: { code: "IT", flag: "🇮🇹" },
    ITALIAN: { code: "IT", flag: "🇮🇹" },
    ES: { code: "ES", flag: "🇪🇸" },
    SPA: { code: "ES", flag: "🇪🇸" },
    SPANISH: { code: "ES", flag: "🇪🇸" },
    FR: { code: "FR", flag: "🇫🇷" },
    FRE: { code: "FR", flag: "🇫🇷" },
    FRA: { code: "FR", flag: "🇫🇷" },
    FRENCH: { code: "FR", flag: "🇫🇷" },
    DE: { code: "DE", flag: "🇩🇪" },
    GER: { code: "DE", flag: "🇩🇪" },
    DEU: { code: "DE", flag: "🇩🇪" },
    GERMAN: { code: "DE", flag: "🇩🇪" },
    PT: { code: "PT", flag: "🇵🇹" },
    POR: { code: "PT", flag: "🇵🇹" },
    PORTUGUESE: { code: "PT", flag: "🇵🇹" },
    RU: { code: "RU", flag: "🇷🇺" },
    RUS: { code: "RU", flag: "🇷🇺" },
    RUSSIAN: { code: "RU", flag: "🇷🇺" },
    JA: { code: "JA", flag: "🇯🇵" },
    JPN: { code: "JA", flag: "🇯🇵" },
    JAPANESE: { code: "JA", flag: "🇯🇵" },
    KO: { code: "KO", flag: "🇰🇷" },
    KOR: { code: "KO", flag: "🇰🇷" },
    KOREAN: { code: "KO", flag: "🇰🇷" },
    ZH: { code: "ZH", flag: "🇨🇳" },
    CHI: { code: "ZH", flag: "🇨🇳" },
    CHT: { code: "ZH", flag: "🇨🇳" },
    CHINESE: { code: "ZH", flag: "🇨🇳" },
    MANDARIN: { code: "ZH", flag: "🇨🇳" },
    HI: { code: "HI", flag: "🇮🇳" },
    HIN: { code: "HI", flag: "🇮🇳" },
    HINDI: { code: "HI", flag: "🇮🇳" },
    TA: { code: "TA", flag: "🇮🇳" },
    TAM: { code: "TA", flag: "🇮🇳" },
    TAMIL: { code: "TA", flag: "🇮🇳" },
    TE: { code: "TE", flag: "🇮🇳" },
    TEL: { code: "TE", flag: "🇮🇳" },
    TELUGU: { code: "TE", flag: "🇮🇳" },
    ML: { code: "ML", flag: "🇮🇳" },
    MAL: { code: "ML", flag: "🇮🇳" },
    MALAYALAM: { code: "ML", flag: "🇮🇳" },
    KN: { code: "KN", flag: "🇮🇳" },
    KAN: { code: "KN", flag: "🇮🇳" },
    KANNADA: { code: "KN", flag: "🇮🇳" },
    BN: { code: "BN", flag: "🇮🇳" },
    BEN: { code: "BN", flag: "🇮🇳" },
    BENGALI: { code: "BN", flag: "🇮🇳" },
    MR: { code: "MR", flag: "🇮🇳" },
    MAR: { code: "MR", flag: "🇮🇳" },
    MARATHI: { code: "MR", flag: "🇮🇳" },
    PA: { code: "PA", flag: "🇮🇳" },
    PAN: { code: "PA", flag: "🇮🇳" },
    PUNJABI: { code: "PA", flag: "🇮🇳" },
    AR: { code: "AR", flag: "🇸🇦" },
    ARA: { code: "AR", flag: "🇸🇦" },
    ARABIC: { code: "AR", flag: "🇸🇦" },
    TR: { code: "TR", flag: "🇹🇷" },
    TUR: { code: "TR", flag: "🇹🇷" },
    TURKISH: { code: "TR", flag: "🇹🇷" },
    NL: { code: "NL", flag: "🇳🇱" },
    DUT: { code: "NL", flag: "🇳🇱" },
    NLD: { code: "NL", flag: "🇳🇱" },
    DUTCH: { code: "NL", flag: "🇳🇱" },
    PL: { code: "PL", flag: "🇵🇱" },
    POL: { code: "PL", flag: "🇵🇱" },
    POLISH: { code: "PL", flag: "🇵🇱" },
    SV: { code: "SV", flag: "🇸🇪" },
    SWE: { code: "SV", flag: "🇸🇪" },
    SWEDISH: { code: "SV", flag: "🇸🇪" },
    NO: { code: "NO", flag: "🇳🇴" },
    NOR: { code: "NO", flag: "🇳🇴" },
    NORWEGIAN: { code: "NO", flag: "🇳🇴" },
    DA: { code: "DA", flag: "🇩🇰" },
    DAN: { code: "DA", flag: "🇩🇰" },
    DANISH: { code: "DA", flag: "🇩🇰" },
    FI: { code: "FI", flag: "🇫🇮" },
    FIN: { code: "FI", flag: "🇫🇮" },
    FINNISH: { code: "FI", flag: "🇫🇮" },
    CS: { code: "CS", flag: "🇨🇿" },
    CZE: { code: "CS", flag: "🇨🇿" },
    CES: { code: "CS", flag: "🇨🇿" },
    CZECH: { code: "CS", flag: "🇨🇿" },
    EL: { code: "EL", flag: "🇬🇷" },
    GRE: { code: "EL", flag: "🇬🇷" },
    ELL: { code: "EL", flag: "🇬🇷" },
    GREEK: { code: "EL", flag: "🇬🇷" },
    HE: { code: "HE", flag: "🇮🇱" },
    HEB: { code: "HE", flag: "🇮🇱" },
    HEBREW: { code: "HE", flag: "🇮🇱" },
    VI: { code: "VI", flag: "🇻🇳" },
    VIE: { code: "VI", flag: "🇻🇳" },
    VIETNAMESE: { code: "VI", flag: "🇻🇳" },
    TH: { code: "TH", flag: "🇹🇭" },
    THA: { code: "TH", flag: "🇹🇭" },
    THAI: { code: "TH", flag: "🇹🇭" },
    ID: { code: "ID", flag: "🇮🇩" },
    IND: { code: "ID", flag: "🇮🇩" },
    INDONESIAN: { code: "ID", flag: "🇮🇩" },
    MS: { code: "MS", flag: "🇲🇾" },
    MAY: { code: "MS", flag: "🇲🇾" },
    MSA: { code: "MS", flag: "🇲🇾" },
    MALAY: { code: "MS", flag: "🇲🇾" },
    UK: { code: "UK", flag: "🇺🇦" },
    UKR: { code: "UK", flag: "🇺🇦" },
    UKRAINIAN: { code: "UK", flag: "🇺🇦" },
    RO: { code: "RO", flag: "🇷🇴" },
    RON: { code: "RO", flag: "🇷🇴" },
    RUM: { code: "RO", flag: "🇷🇴" },
    ROMANIAN: { code: "RO", flag: "🇷🇴" },
    HU: { code: "HU", flag: "🇭🇺" },
    HUN: { code: "HU", flag: "🇭🇺" },
    HUNGARIAN: { code: "HU", flag: "🇭🇺" },
    BG: { code: "BG", flag: "🇧🇬" },
    BUL: { code: "BG", flag: "🇧🇬" },
    BULGARIAN: { code: "BG", flag: "🇧🇬" },
    SR: { code: "SR", flag: "🇷🇸" },
    SRP: { code: "SR", flag: "🇷🇸" },
    SERBIAN: { code: "SR", flag: "🇷🇸" },
    HR: { code: "HR", flag: "🇭🇷" },
    HRV: { code: "HR", flag: "🇭🇷" },
    CROATIAN: { code: "HR", flag: "🇭🇷" },
    SK: { code: "SK", flag: "🇸🇰" },
    SLO: { code: "SK", flag: "🇸🇰" },
    SLK: { code: "SK", flag: "🇸🇰" },
    SLOVAK: { code: "SK", flag: "🇸🇰" },
    SL: { code: "SL", flag: "🇸🇮" },
    SLV: { code: "SL", flag: "🇸🇮" },
    SLOVENIAN: { code: "SL", flag: "🇸🇮" },
    CA: { code: "CA", flag: "🏴" },
    CAT: { code: "CA", flag: "🏴" },
    CATALAN: { code: "CA", flag: "🏴" },
    FA: { code: "FA", flag: "🇮🇷" },
    PER: { code: "FA", flag: "🇮🇷" },
    FAS: { code: "FA", flag: "🇮🇷" },
    PERSIAN: { code: "FA", flag: "🇮🇷" },
    UR: { code: "UR", flag: "🇵🇰" },
    URD: { code: "UR", flag: "🇵🇰" },
    URDU: { code: "UR", flag: "🇵🇰" },
};

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
    const mappedTokens = filenameTokens.map((token) => LANGUAGE_ALIAS_TO_TAG[token]?.code ?? null);

    mappedTokens.forEach((code, index) => {
        if (!code) return;
        const token = filenameTokens[index];
        const isLongCode = token.length >= 3;
        const isPartOfLanguageRun = Boolean(mappedTokens[index - 1] || mappedTokens[index + 1]);
        if (isLongCode || isPartOfLanguageRun) add(code);
    });

    return codes;
};

// Precompile regex patterns for better performance
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
            if (LANGUAGE_ALIAS_TO_TAG[token.toUpperCase()])
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

export const buildAudioLanguageBadge = (text: string): string | null => {
    const labels: string[] = [];
    const seen = new Set<string>();
    const seenFlags = new Set<string>();

    const flags = text.match(FLAG_EMOJI_REGEX) || [];
    for (const flag of flags) {
        const langCode = flagEmojiToLanguageCode(flag);
        if (!langCode) continue;
        const label = `${flag} ${langCode}`;
        if (seen.has(label)) continue;
        seen.add(label);
        seenFlags.add(flag);
        labels.push(label);
    }

    const tokens = text.toUpperCase().match(/[A-Z]{2,12}/g) || [];
    for (const token of tokens) {
        const tag = LANGUAGE_ALIAS_TO_TAG[token];
        if (!tag) continue;
        if (tag.flag && seenFlags.has(tag.flag)) continue;
        const label = tag.flag ? `${tag.flag} ${tag.code}` : tag.code;
        if (seen.has(label)) continue;
        seen.add(label);
        labels.push(label);
    }

    if (labels.length === 0) return null;
    const limited = labels.slice(0, 4);
    const remainder = labels.length - limited.length;
    const suffix = remainder > 0 ? ` +${remainder}` : "";
    return `🌐 ${limited.join(" + ")}${suffix}`;
};
