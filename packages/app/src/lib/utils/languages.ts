const LANGUAGE_ALIASES: Record<string, string[]> = {
    EN: ["EN", "ENG", "ENGLISH"],
    IT: ["IT", "ITA", "ITALIAN"],
    ES: ["ES", "SPA", "SPANISH"],
    FR: ["FR", "FRE", "FRA", "FRENCH"],
    DE: ["DE", "GER", "DEU", "GERMAN"],
    PT: ["PT", "POR", "PORTUGUESE"],
    RU: ["RU", "RUS", "RUSSIAN"],
    JA: ["JA", "JPN", "JAPANESE"],
    KO: ["KO", "KOR", "KOREAN"],
    ZH: ["ZH", "CHI", "CHT", "CHINESE", "MANDARIN"],
    HI: ["HI", "HIN", "HINDI"],
    TA: ["TA", "TAM", "TAMIL"],
    TE: ["TE", "TEL", "TELUGU"],
    ML: ["ML", "MAL", "MALAYALAM"],
    KN: ["KN", "KAN", "KANNADA"],
    BN: ["BN", "BEN", "BENGALI"],
    MR: ["MR", "MAR", "MARATHI"],
    PA: ["PA", "PAN", "PUNJABI"],
    AR: ["AR", "ARA", "ARABIC"],
    TR: ["TR", "TUR", "TURKISH"],
    NL: ["NL", "DUT", "NLD", "DUTCH"],
    PL: ["PL", "POL", "POLISH"],
    SV: ["SV", "SWE", "SWEDISH"],
    NO: ["NO", "NOR", "NORWEGIAN"],
    DA: ["DA", "DAN", "DANISH"],
    FI: ["FI", "FIN", "FINNISH"],
    CS: ["CS", "CZE", "CES", "CZECH"],
    EL: ["EL", "GRE", "ELL", "GREEK"],
    HE: ["HE", "HEB", "HEBREW"],
    VI: ["VI", "VIE", "VIETNAMESE"],
    TH: ["TH", "THA", "THAI"],
    ID: ["ID", "IND", "INDONESIAN"],
    MS: ["MS", "MAY", "MSA", "MALAY"],
    UK: ["UK", "UKR", "UKRAINIAN"],
    RO: ["RO", "RON", "RUM", "ROMANIAN"],
    HU: ["HU", "HUN", "HUNGARIAN"],
    BG: ["BG", "BUL", "BULGARIAN"],
    SR: ["SR", "SRP", "SERBIAN"],
    HR: ["HR", "HRV", "CROATIAN"],
    SK: ["SK", "SLO", "SLK", "SLOVAK"],
    SL: ["SL", "SLV", "SLOVENIAN"],
    CA: ["CA", "CAT", "CATALAN"],
    FA: ["FA", "PER", "FAS", "PERSIAN"],
    UR: ["UR", "URD", "URDU"],
};

const ALIAS_TO_CODE = new Map(
    Object.entries(LANGUAGE_ALIASES).flatMap(([code, aliases]) => aliases.map((alias) => [alias, code] as const)),
);

export const languageCode = (alias: string | null | undefined) => ALIAS_TO_CODE.get(String(alias ?? "").toUpperCase()) ?? null;

export const preferredLanguage = () => languageCode(new Intl.Locale(Intl.DateTimeFormat().resolvedOptions().locale).language) ?? "EN";

/** OpenSubtitles codes that are not language tags. */
const SUBTITLE_SITE_TAGS: Record<string, string> = {
    pob: "pt-BR",
    pb: "pt-BR",
    zht: "zh-Hant",
    zhs: "zh-Hans",
    ze: "zh",
    spn: "es-ES",
    spl: "es-419",
    ea: "es-419",
};

let displayNames: Intl.DisplayNames | undefined;

/** A language's name in the viewer's own language, from a tag or an ISO 639 code; null when unknown. */
export function languageName(lang: string | null | undefined) {
    const tag = lang?.trim().toLowerCase();
    if (!tag || tag === "und") return null;
    displayNames ??= new Intl.DisplayNames([Intl.DateTimeFormat().resolvedOptions().locale], { type: "language", fallback: "none" });
    try {
        return displayNames.of(SUBTITLE_SITE_TAGS[tag] ?? tag) ?? tag.toUpperCase();
    } catch {
        return tag.toUpperCase();
    }
}
