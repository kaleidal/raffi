import { addLimboTorrent, getLimboTorrent, removeLimboTorrent } from "../../../lib/streams/limboClient";
import { ensureTorrentingAllowed } from "../../../lib/stores/torrenting";
import { loadingDetails, loadingProgress, loadingStage } from "../playerState";
import { createTorrentStatusPoller } from "../session/torrentStatusPolling";

/** Streams a magnet through the paired Limbo, which serves the file over HTTP for the native player. */
export function createTvTorrentStream() {
	const poller = createTorrentStatusPoller({});
	let torrentId: string | null = null;
	let controller: AbortController | null = null;

	function close() {
		controller?.abort();
		controller = null;
		poller.stop();
		if (torrentId) void removeLimboTorrent(torrentId, false);
		torrentId = null;
	}

	async function open(magnet: string, fileIndex: number | null, name: string | null): Promise<string> {
		close();
		const { signal } = (controller = new AbortController());
		loadingStage.set("Connecting to Limbo");
		loadingDetails.set("");
		loadingProgress.set(null);
		await ensureTorrentingAllowed(signal);

		loadingStage.set("Adding torrent");
		const created = await addLimboTorrent({ magnet, fileIndex, sequential: true, name }, signal);
		torrentId = created.id;
		await poller.waitUntilReady(created.id);
		poller.stop();

		const ready = await getLimboTorrent(created.id, signal);
		if (!ready.streamUrl) throw new Error("Limbo did not return a stream URL for this torrent");
		return ready.streamUrl;
	}

	return { open, close };
}
