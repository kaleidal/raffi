<script lang="ts">
	import { primaryButton } from "../buttons";
	import { formatReleaseNotes } from "../../../lib/shell/updateNotes";
	import { updateStatus } from "../../../lib/stores/authStore";

	let showNotes = $state(false);
</script>

{#if $updateStatus.available}
	<div class="flex flex-col gap-3 pb-4">
		<div class="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
			<div>
				<p class="font-medium text-ink">
					{$updateStatus.version ? `Raffi ${$updateStatus.version} is ready` : "A new version is ready"}
				</p>
				<button
					class="mt-0.5 cursor-pointer text-sm text-ink/55 underline underline-offset-4 hover:text-ink"
					onclick={() => (showNotes = !showNotes)}
				>
					{showNotes ? "Hide changes" : "See what's new"}
				</button>
			</div>
			{#if $updateStatus.downloaded}
				<button
					class={primaryButton}
					onclick={() => window.electronAPI?.installUpdate?.()}
				>
					Restart to update
				</button>
			{:else}
				<span class="text-sm text-ink/50">Downloading…</span>
			{/if}
		</div>
		{#if showNotes}
			<div class="release-notes-content max-h-[260px] overflow-y-auto rounded-3xl bg-ink/6 p-5 text-sm text-ink/70">
				{@html formatReleaseNotes($updateStatus.notes || "Release notes unavailable.")}
			</div>
		{/if}
	</div>
{/if}
