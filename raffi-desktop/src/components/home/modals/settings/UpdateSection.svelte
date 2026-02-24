<script lang="ts">
	import { formatReleaseNotes } from "../../../../lib/updateNotes";

	export let available = false;
	export let version: string | null | undefined = null;
	export let downloaded = false;
	export let notes: string | null | undefined = null;
	export let showUpdateNotes = false;
	export let onInstallUpdate: () => void = () => {};
	export let onToggleNotes: () => void = () => {};
</script>

{#if available}
	<section class="rounded-[28px] bg-white/[0.04] p-6 flex flex-col gap-4">
		<div class="flex flex-col gap-1">
			<h3 class="text-white text-xl font-semibold">Update available</h3>
			<p class="text-white/60 text-sm">
				{#if version}
					Version {version} is ready to install.
				{:else}
					A new version is ready to install.
				{/if}
			</p>
		</div>
		<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
			{#if downloaded}
				<button
					class="bg-white text-black px-4 py-2 rounded-2xl font-semibold hover:bg-white/90 transition-colors cursor-pointer"
					on:click={onInstallUpdate}
				>
					Restart to update
				</button>
			{:else}
				<span class="text-white/50 text-sm">Downloading update…</span>
			{/if}
			<button
				class="text-white/70 text-sm underline underline-offset-4 hover:text-white"
				on:click={onToggleNotes}
			>
				{showUpdateNotes ? "Hide changes" : "View changes"}
			</button>
		</div>
		{#if showUpdateNotes}
			<div class="release-notes-content rounded-2xl bg-white/[0.06] p-4 text-white/70 text-sm max-h-[200px] overflow-y-auto">
				{@html formatReleaseNotes(notes || "Release notes unavailable.")}
			</div>
		{/if}
	</section>
{/if}

<style>
	.release-notes-content :global(h1),
	.release-notes-content :global(h2),
	.release-notes-content :global(h3),
	.release-notes-content :global(h4) {
		color: white;
		font-weight: 700;
		line-height: 1.2;
		margin: 0 0 0.65rem;
	}

	.release-notes-content :global(h1) {
		font-size: 1.15rem;
	}

	.release-notes-content :global(h2) {
		font-size: 1.05rem;
	}

	.release-notes-content :global(h3),
	.release-notes-content :global(h4) {
		font-size: 0.98rem;
	}

	.release-notes-content :global(p),
	.release-notes-content :global(ul),
	.release-notes-content :global(ol),
	.release-notes-content :global(blockquote),
	.release-notes-content :global(pre) {
		margin: 0 0 0.65rem;
	}

	.release-notes-content :global(ul) {
		list-style: disc;
		padding-left: 1.2rem;
	}

	.release-notes-content :global(ol) {
		list-style: decimal;
		padding-left: 1.2rem;
	}

	.release-notes-content :global(li) {
		margin: 0.2rem 0;
	}

	.release-notes-content :global(code) {
		background: rgba(255, 255, 255, 0.09);
		border-radius: 0.35rem;
		padding: 0.1rem 0.35rem;
		color: white;
		font-size: 0.85em;
	}

	.release-notes-content :global(blockquote) {
		border-left: 2px solid rgba(255, 255, 255, 0.3);
		padding-left: 0.65rem;
		color: rgba(255, 255, 255, 0.72);
	}

	.release-notes-content :global(a) {
		color: white;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.release-notes-content :global(hr) {
		border: 0;
		border-top: 1px solid rgba(255, 255, 255, 0.18);
		margin: 0.75rem 0;
	}

	.release-notes-content :global(*:last-child) {
		margin-bottom: 0;
	}
</style>
