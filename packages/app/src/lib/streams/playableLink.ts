import { router } from "../stores/router";

export type PlayableLink = { kind: "magnet" | "url"; href: string };

export function parsePlayableLink(text: string): PlayableLink | null {
    const href = text.trim();
    if (/^magnet:\?\S*xt=urn:btih:/i.test(href)) return { kind: "magnet", href };
    if (/^https?:\/\/\S+$/i.test(href)) return { kind: "url", href };
    return null;
}

export function playLink(link: PlayableLink) {
    router.navigate("player", {
        videoSrc: link.href,
        startTime: 0,
        metaData: null,
        fileIdx: null,
        season: null,
        episode: null,
    });
}
