import { requestNative } from "../tv/bridge";
import { isTvPlatform } from "./platform";

type HostFetchInit = {
	method?: string;
	headers?: Record<string, string>;
	body?: string;
	timeoutMs?: number;
	signal?: AbortSignal;
};
type HostResponse = { status: number; contentType: string; body: string } | { error: string };

/** The host can't cancel a request, so callers check their own signal once it answers. */
async function fetchThroughTvHost(url: string, { signal: _signal, ...init }: HostFetchInit = {}) {
	const result = await requestNative<HostResponse>({ type: "http.request", url, ...init, headers: init.headers ?? {} });
	if ("error" in result) throw new TypeError(result.error);
	return new Response(result.body, { status: result.status, headers: { "content-type": result.contentType } });
}

/** A request the native host makes when it can, so services that don't allow our origin and devices on the local network still answer. */
export const hostFetch = (url: string, init?: HostFetchInit) =>
	isTvPlatform ? fetchThroughTvHost(url, init) : fetch(url, init);
