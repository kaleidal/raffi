import { parseM3U } from "../packages/app/src/lib/iptv/m3u.ts";
import { getNowNext, getProgrammeCount, parseXmltv } from "../packages/app/src/lib/iptv/xmltv.ts";

const MAX_M3U_BYTES = 64 * 1024 * 1024;
const MAX_EPG_BYTES = 128 * 1024 * 1024;

function requireEnv(name) {
    const value = String(process.env[name] || "").trim();
    if (!value) {
        throw new Error(`${name} is required`);
    }
    return value;
}

async function fetchText(label, target, maxBytes) {
    let response;
    try {
        response = await fetch(target, { redirect: "follow" });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${label} fetch failed before HTTP response: ${message}`);
    }

    const arrayBuffer = await response.arrayBuffer();

    if (arrayBuffer.byteLength > maxBytes) {
        throw new Error("IPTV response exceeded maximum size");
    }

    return {
        status: response.status,
        ok: response.ok,
        text: new TextDecoder("utf-8").decode(arrayBuffer),
    };
}

async function main() {
    const m3uUrl = requireEnv("IPTV_M3U_URL");
    const epgUrl = requireEnv("IPTV_EPG_URL");

    const m3u = await fetchText("M3U", m3uUrl, MAX_M3U_BYTES);
    if (!m3u.ok) {
        throw new Error(`M3U fetch failed with HTTP ${m3u.status}`);
    }

    const parsed = parseM3U(m3u.text, "smoke");

    const epg = await fetchText("EPG", epgUrl, MAX_EPG_BYTES);
    if (!epg.ok) {
        throw new Error(`EPG fetch failed with HTTP ${epg.status}`);
    }

    const guide = parseXmltv(epg.text);
    const sampleChannels = parsed.channels.slice(0, 50);
    const nowNextMatchesInFirst50 = sampleChannels.filter((channel) => {
        const match = getNowNext(channel, guide);
        return Boolean(match.now || match.next);
    }).length;

    console.log(
        JSON.stringify(
            {
                m3uStatus: m3u.status,
                channelCount: parsed.channels.length,
                groupCount: parsed.groups.length,
                epgStatus: epg.status,
                programmeCount: getProgrammeCount(guide),
                nowNextMatchesInFirst50,
            },
            null,
            2,
        ),
    );
}

main().catch((error) => {
    console.error(
        JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        }),
    );
    process.exit(1);
});
