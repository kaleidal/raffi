import type { LiveChannel, XtreamSource } from "./types";
import { UNGROUPED, type ParsedPlaylist } from "./parse/m3u";

type Account = Pick<XtreamSource, "serverUrl" | "username" | "password">;

export type Category = { category_id: string | number; category_name?: string };

export type Stream = {
	num?: number | string;
	name?: string;
	stream_id: number | string;
	stream_icon?: string;
	epg_channel_id?: string | null;
	category_id?: string | number | null;
};

type AccountInfo = {
	user_info?: { auth?: number | string; status?: string; allowed_output_formats?: string[] };
};

export function normalizeServerUrl(value: string) {
	const url = new URL(value.trim());
	if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Use an http or https address");
	return `${url.origin}${url.pathname.replace(/\/(player_api\.php|get\.php)?\/*$/, "")}`;
}

export const xtreamApiUrl = (account: Account, action?: string) => {
	const params = new URLSearchParams({ username: account.username, password: account.password });
	if (action) params.set("action", action);
	return `${normalizeServerUrl(account.serverUrl)}/player_api.php?${params}`;
};

export const xtreamGuideUrl = (account: Account) => {
	const params = new URLSearchParams({ username: account.username, password: account.password });
	return `${normalizeServerUrl(account.serverUrl)}/xmltv.php?${params}`;
};

const streamUrl = (account: Account, id: string | number, extension: string) =>
	`${normalizeServerUrl(account.serverUrl)}/live/${encodeURIComponent(account.username)}/${encodeURIComponent(account.password)}/${id}.${extension}`;

/** HLS plays everywhere Raffi does, so it wins whenever the account allows it. */
const pickExtension = (formats: string[] | undefined) =>
	!formats?.length || formats.includes("m3u8") ? "m3u8" : formats.includes("ts") ? "ts" : formats[0];

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());

/** Confirms the account works and picks the stream format it allows. */
export async function checkXtreamAccount(source: XtreamSource, fetchJson: <T>(url: string) => Promise<T>) {
	const user = (await fetchJson<AccountInfo>(xtreamApiUrl(source))).user_info;
	if (!user || String(user.auth) === "0") throw new Error("The server didn't accept this username and password");
	if (user.status && user.status.toLowerCase() !== "active") throw new Error(`This account is ${user.status.toLowerCase()}`);
	return pickExtension(user.allowed_output_formats);
}

export function buildXtreamLineup(
	source: XtreamSource,
	extension: string,
	categories: Category[],
	streams: Stream[],
): ParsedPlaylist {
	const categoryNames = new Map(categories.map((category) => [text(category.category_id), text(category.category_name)]));
	const groups = new Map<string, true>();
	for (const category of categories) groups.set(text(category.category_name) || UNGROUPED, true);

	const channels: LiveChannel[] = streams.map((stream, index) => ({
		id: `${source.id}:${stream.stream_id}`,
		name: text(stream.name) || `Channel ${index + 1}`,
		url: streamUrl(source, stream.stream_id, extension),
		group: categoryNames.get(text(stream.category_id)) || UNGROUPED,
		logo: text(stream.stream_icon) || undefined,
		number: text(stream.num) || undefined,
		tvgId: text(stream.epg_channel_id) || undefined,
	}));

	const used = new Set(channels.map((channel) => channel.group));
	for (const group of used) groups.set(group, true);
	return { channels, groups: [...groups.keys()].filter((group) => used.has(group)) };
}
