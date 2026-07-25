export type CreateClipRequest = {
	source: string;
	start: number;
	end: number;
	name?: string;
	outputPath?: string;
};

export type CreateClipResponse = {
	outputPath: string;
};

/** In-app clip export via MediaBunny. */
export async function createClip(req: CreateClipRequest): Promise<CreateClipResponse> {
	const { exportClipWithMediaBunny } = await import("./media/clip");
	const start = Math.max(0, req.start);
	const end = Math.max(start + 0.1, req.end);

	const exported = await exportClipWithMediaBunny({
		source: req.source,
		start,
		end,
	});

	const electronApi = typeof window !== "undefined" ? window.electronAPI : undefined;
	if (req.outputPath && electronApi?.writeClipFile) {
		const copy = exported.bytes.slice();
		const written = await electronApi.writeClipFile(
			req.outputPath,
			copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength),
		);
		if (!written?.ok || !written.filePath) {
			throw new Error(written?.error || "Failed to write clip file");
		}
		return { outputPath: written.filePath };
	}

	if (typeof document !== "undefined") {
		const copy = exported.bytes.slice();
		const blob = new Blob([copy], { type: exported.mimeType });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = req.name || `clip_${Date.now()}.mp4`;
		anchor.click();
		URL.revokeObjectURL(url);
		return { outputPath: anchor.download };
	}

	throw new Error("No place to save the clip");
}
