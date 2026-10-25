import disposableDomains from "disposable-email-domains-js/dist/dict/disposable_email_blocklist.json";

const DISPOSABLE_DOMAINS = new Set<string>(disposableDomains);

// Providers people actually sign up with. Addresses on these never count as typos,
// and the single-domain ones are what a near miss gets corrected to.
const TYPO_TARGETS = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "protonmail.com",
  "proton.me",
  "yandex.com",
  "yandex.ru",
  "rocketmail.com",
  "comcast.net",
  "verizon.net",
  "sbcglobal.net",
  "btinternet.com",
  "t-online.de",
];

const KNOWN_DOMAINS = new Set([
  ...TYPO_TARGETS,
  "aol.com", "aim.com", "gmx.com", "gmx.net", "gmx.de", "gmx.at", "gmx.ch", "web.de", "mail.com", "email.com",
  "me.com", "mac.com", "live.com", "msn.com", "ymail.com", "pm.me", "protonmail.ch", "tutanota.com", "tuta.io",
  "zoho.com", "fastmail.com", "hey.com", "mail.ru", "inbox.ru", "list.ru", "bk.ru", "ya.ru", "qq.com", "163.com",
  "126.com", "naver.com", "freenet.de", "orange.fr", "free.fr", "laposte.net", "libero.it", "virgilio.it",
  "sky.com", "att.net", "cox.net", "shaw.ca", "rogers.com", "bigpond.com", "seznam.cz", "wp.pl", "o2.pl",
  "onet.pl", "abv.bg", "eunet.rs", "sbb.rs", "mts.rs",
]);

// Providers with a domain per country (hotmail.de, yahoo.co.uk, ...). A different
// suffix on these is usually legitimate, so only the obvious TLD typos get flagged.
const REGIONAL_PROVIDERS = new Set(["hotmail", "yahoo", "outlook", "live", "msn", "windowslive", "gmx"]);

// Suffixes that aren't real TLDs but sit a keystroke away from one. Real ones like .co
// or .cm only count as typos when they land next to a provider below.
const TLD_TYPOS: Record<string, string> = {
  con: "com", cmo: "com", ocm: "com", vom: "com", xom: "com", cpm: "com", cim: "com", comm: "com", coom: "com",
  cpom: "com",
  nte: "net", ent: "net", nett: "net", ner: "net",
  ogr: "org", rog: "org", orgg: "org",
};

export type EmailScreening =
  | { ok: true; email: string }
  | { ok: false; reason: "invalid" | "disposable" }
  | { ok: false; reason: "typo"; suggestion: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

const isValidDomain = (domain: string) => {
  const labels = domain.split(".");
  return domain.length <= 253
    && labels.length >= 2
    && labels.every((label) => label.length <= 63 && DOMAIN_LABEL.test(label))
    && /^[a-z]{2,}$/.test(labels.at(-1)!);
};

// Optimal string alignment distance, so swapped neighbours (gmial) count as one edit.
const editDistance = (a: string, b: string) => {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, rows[i - 2]![j - 2]! + 1);
      }
      rows[i]![j] = best;
    }
  }
  return rows[a.length]![b.length]!;
};

export const suggestDomain = (domain: string): string | null => {
  if (KNOWN_DOMAINS.has(domain)) return null;

  const dot = domain.lastIndexOf(".");
  const tld = domain.slice(dot + 1);
  const fixedTld = TLD_TYPOS[tld];
  const candidate = fixedTld ? `${domain.slice(0, dot)}.${fixedTld}` : domain;
  if (KNOWN_DOMAINS.has(candidate)) return candidate;

  const provider = candidate.split(".")[0]!;
  if (REGIONAL_PROVIDERS.has(provider)) return fixedTld ? candidate : null;

  let best: { domain: string; distance: number } | null = null;
  for (const target of TYPO_TARGETS) {
    const distance = editDistance(candidate, target);
    if (!best || distance < best.distance) best = { domain: target, distance };
  }
  if (best && best.distance <= (best.domain.length >= 10 ? 2 : 1)) return best.domain;
  return fixedTld ? candidate : null;
};

export const isDisposableDomain = (domain: string) => {
  const labels = domain.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    if (DISPOSABLE_DOMAINS.has(labels.slice(i).join("."))) return true;
  }
  return false;
};

export const screenEmail = (value: string): EmailScreening => {
  const email = normalizeEmail(value);
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return { ok: false, reason: "invalid" };

  const at = email.lastIndexOf("@");
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || !isValidDomain(domain)) return { ok: false, reason: "invalid" };
  // Typo first: a lot of near-miss provider domains are squatted by throwaway services.
  const suggestion = suggestDomain(domain);
  if (suggestion) return { ok: false, reason: "typo", suggestion: `${local}@${suggestion}` };
  if (isDisposableDomain(domain)) return { ok: false, reason: "disposable" };

  return { ok: true, email };
};
