import type { IptvChannel, XmltvGuide, XmltvProgramme } from "./types";
import { resolveXmltvChannelId } from "./xmltv";

export type GuideProgrammeState = "past" | "current" | "future";

export interface GuideGridViewport {
    viewportStart: Date;
    viewportEnd: Date;
    now: Date;
}

export interface GuideGridProgramme {
    id: string;
    title: string;
    subTitle?: string;
    description?: string;
    start: Date;
    stop: Date;
    timeRange: string;
    leftPercent: number;
    widthPercent: number;
    state: GuideProgrammeState;
    startsBeforeViewport: boolean;
    endsAfterViewport: boolean;
}

export interface GuideGridRow {
    channel: IptvChannel;
    programmes: GuideGridProgramme[];
}

function roundPercent(value: number): number {
    return Math.round(value * 10_000) / 10_000;
}

function formatTime(value: Date, offsetMinutes?: number): string {
    if (typeof offsetMinutes === "number" && Number.isFinite(offsetMinutes)) {
        const local = new Date(value.getTime() + offsetMinutes * 60_000);
        const hour24 = local.getUTCHours();
        const hour12 = hour24 % 12 || 12;
        const minute = String(local.getUTCMinutes()).padStart(2, "0");
        const suffix = hour24 < 12 ? "AM" : "PM";
        return `${hour12}:${minute} ${suffix}`;
    }

    return new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
    }).format(value);
}

function getProgrammeState(programme: XmltvProgramme, now: Date): GuideProgrammeState {
    const nowMs = now.getTime();
    const startMs = programme.start.getTime();
    const stopMs = programme.stop.getTime();

    if (startMs <= nowMs && nowMs < stopMs) return "current";
    if (startMs > nowMs) return "future";
    return "past";
}

function toGridProgramme(
    programme: XmltvProgramme,
    viewport: GuideGridViewport,
): GuideGridProgramme | null {
    const viewportStartMs = viewport.viewportStart.getTime();
    const viewportEndMs = viewport.viewportEnd.getTime();
    const viewportDurationMs = viewportEndMs - viewportStartMs;
    const startMs = programme.start.getTime();
    const stopMs = programme.stop.getTime();

    if (stopMs <= startMs) {
        return null;
    }

    if (viewportDurationMs <= 0 || stopMs <= viewportStartMs || startMs >= viewportEndMs) {
        return null;
    }

    const clippedStartMs = Math.max(startMs, viewportStartMs);
    const clippedStopMs = Math.min(stopMs, viewportEndMs);
    const leftPercent = roundPercent(((clippedStartMs - viewportStartMs) / viewportDurationMs) * 100);
    const widthPercent = roundPercent(((clippedStopMs - clippedStartMs) / viewportDurationMs) * 100);

    return {
        id: `${programme.channelId}:${startMs}:${stopMs}:${programme.title}`,
        title: programme.title,
        subTitle: programme.subTitle,
        description: programme.description,
        start: programme.start,
        stop: programme.stop,
        timeRange: `${formatTime(programme.start, programme.startOffsetMinutes)}-${formatTime(
            programme.stop,
            programme.stopOffsetMinutes,
        )}`,
        leftPercent,
        widthPercent,
        state: getProgrammeState(programme, viewport.now),
        startsBeforeViewport: startMs < viewportStartMs,
        endsAfterViewport: stopMs > viewportEndMs,
    };
}

export function buildGuideRows(
    channels: IptvChannel[],
    guide: XmltvGuide | null | undefined,
    viewport: GuideGridViewport,
): GuideGridRow[] {
    return channels.map((channel) => {
        const guideChannelId = guide ? resolveXmltvChannelId(channel, guide) : null;
        const programmes = guideChannelId ? guide?.programmesByChannel.get(guideChannelId) ?? [] : [];

        return {
            channel,
            programmes: programmes
                .map((programme) => toGridProgramme(programme, viewport))
                .filter((programme): programme is GuideGridProgramme => Boolean(programme)),
        };
    });
}

export function getNowLinePercent({
    viewportStart,
    viewportEnd,
    now,
}: GuideGridViewport): number {
    const viewportStartMs = viewportStart.getTime();
    const viewportDurationMs = viewportEnd.getTime() - viewportStartMs;

    if (viewportDurationMs <= 0) return 0;

    return roundPercent(((now.getTime() - viewportStartMs) / viewportDurationMs) * 100);
}
