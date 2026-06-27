export type IptvSourceKind = "m3u" | "xtream";

interface IptvBaseSource {
    id: string;
    name: string;
    kind: IptvSourceKind;
    createdAt: string;
    updatedAt: string;
}

export interface IptvM3uSource extends IptvBaseSource {
    kind: "m3u";
    m3uUrl: string;
    epgUrl?: string;
}

export interface IptvXtreamSource extends IptvBaseSource {
    kind: "xtream";
    serverUrl: string;
    username: string;
    credential: string;
}

export type IptvSource = IptvM3uSource | IptvXtreamSource;

export interface IptvChannel {
    id: string;
    sourceId: string;
    name: string;
    url: string;
    group: string;
    tvgId?: string;
    tvgName?: string;
    logo?: string;
    number?: string;
    order: number;
}

export interface IptvGroup {
    id: string;
    sourceId: string;
    name: string;
    channelCount: number;
    order: number;
}

export interface IptvParseResult {
    channels: IptvChannel[];
    groups: IptvGroup[];
}

export interface XmltvProgramme {
    channelId: string;
    start: Date;
    stop: Date;
    startOffsetMinutes?: number;
    stopOffsetMinutes?: number;
    title: string;
    subTitle?: string;
    description?: string;
}

export interface XmltvChannel {
    id: string;
    displayNames: string[];
}

export interface XmltvGuide {
    channels: Map<string, XmltvChannel>;
    programmesByChannel: Map<string, XmltvProgramme[]>;
    displayNameToChannelId: Map<string, string>;
}

export interface IptvRefreshStats {
    channelCount: number;
    groupCount: number;
    programmeCount: number;
}

export interface IptvRefreshResult {
    channels: IptvChannel[];
    groups: IptvGroup[];
    guide?: XmltvGuide;
    loadedAt: string;
    stats: IptvRefreshStats;
}

export interface IptvLiveChannelMetadata {
    name: string;
    group?: string | null;
    logo?: string | null;
    tvgId?: string | null;
    programmeTitle?: string | null;
}
