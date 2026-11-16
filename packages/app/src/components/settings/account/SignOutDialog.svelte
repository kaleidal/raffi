<script lang="ts">
	import { fade, scale } from "svelte/transition";
	import { portal } from "../../common/portal";

	let { onChoose, onCancel }: { onChoose: (keepData: boolean) => void; onCancel: () => void } = $props();

	const choices = [
		{ keep: true, title: "Keep my data here", detail: "Copies your library and lists onto this device." },
		{ keep: false, title: "Start fresh", detail: "Clears the synced copy from this device." },
	];
</script>

<div
	use:portal
	class="raffi-modal-backdrop fixed inset-0 z-[260] flex items-center justify-center bg-canvas/60 backdrop-blur-sm"
	transition:fade={{ duration: 150 }}
	onclick={(event) => event.target === event.currentTarget && onCancel()}
	onkeydown={(event) => event.key === "Escape" && onCancel()}
	role="presentation"
>
	<div
		class="raffi-modal-surface flex w-full max-w-lg flex-col gap-5 rounded-[32px] bg-surface p-7 shadow-[0_30px_100px_rgba(0,0,0,0.38)]"
		transition:scale={{ start: 0.96, duration: 150 }}
		role="dialog"
		aria-modal="true"
		aria-labelledby="sign-out-title"
	>
		<h3 id="sign-out-title" class="text-2xl font-semibold text-ink">Sign out</h3>

		<div class="flex flex-col gap-2">
			{#each choices as choice (choice.title)}
				<button
					class="cursor-pointer rounded-3xl bg-ink/6 p-5 text-left transition-colors hover:bg-ink/12"
					onclick={() => onChoose(choice.keep)}
				>
					<span class="block font-semibold text-ink">{choice.title}</span>
					<span class="mt-1 block text-sm text-ink/60">{choice.detail}</span>
				</button>
			{/each}
		</div>

		<button
			class="cursor-pointer self-end rounded-full bg-ink/10 px-5 py-2.5 font-semibold text-ink hover:bg-ink/16"
			onclick={onCancel}
		>
			Cancel
		</button>
	</div>
</div>
