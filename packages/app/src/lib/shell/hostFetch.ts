import { requestNative } from "../tv/bridge";
import { isTvPlatform } from "./platform";

type HostFetchInit = { headers?: Record<string, string>; signal?: AbortSignal };
type HostResponse = { status: number; contentType: string; body: string } | { error: string };

async function fetchThroughTvHost(url: string, init?: HostFetchInit) {
	const result = await requestNative<HostResponse>({ type: "http.get", url, headers: init?.headers ?? {} });
	if ("error" in result) throw new TypeError(result.error);
	return new Response(result.body, { status: result.status, headers: { "content-type": result.contentType } });
}

/** A GET the native host makes when it can, so services that don't allow our origin still answer. */
export const hostFetch = (url: string, init?: HostFetchInit) =>
	isTvPlatform ? fetchThroughTvHost(url, init) : fetch(url, init);
