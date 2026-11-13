export type LiveSourceKind = "m3u" | "xtream";

type SourceBase = {
	id: string;
	name: string;
	createdAt: number;
};

export type M3uSource = SourceBase & {
	kind: "m3u";
	playlistUrl: string;
	guideUrl?: string;
};

export type XtreamSource = SourceBase & {
	kind: "xtream";
	serverUrl: string;
	username: string;
	password: string;
};

export type LiveSource = M3uSource | XtreamSource;

/** Request headers a playlist asks for, which some providers check before serving a stream. */
export type StreamHeaders = {
	userAgent?: string;
	referrer?: string;
};

export type LiveChannel = {
	id: string;
	name: string;
	url: string;
	group: string;
	logo?: string;
	number?: string;
	/** The `tvg-id` a playlist gives, or the EPG id an Xtream server reports. */
	tvgId?: string;
	tvgName?: string;
	/** The guide channel this one was matched to, once a guide has been read. */
	guideId?: string;
	headers?: StreamHeaders;
};

export type LiveLineup = {
	sourceId: string;
	channels: LiveChannel[];
	groups: string[];
	/** Guide addresses the playlist itself names, used when the source doesn't set any. */
	playlistGuideUrls?: string[];
	refreshedAt: number;
	guideRefreshedAt?: number;
};

export type Programme = {
	start: number;
	stop: number;
	title: string;
	subtitle?: string;
	description?: string;
};
