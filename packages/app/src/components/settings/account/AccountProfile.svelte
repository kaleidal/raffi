<script lang="ts">
	import { Camera, Pencil } from "@lucide/svelte";
	import ShapeLoader from "../../common/loading/ShapeLoader.svelte";
	import {
		changeAccountAvatar,
		currentUser,
		renameAccount,
	} from "../../../lib/stores/authStore";

	let fileInput: HTMLInputElement;
	let editingName = $state(false);
	let draftName = $state("");
	let savingName = $state(false);
	let avatarBusy = $state(false);
	let error = $state("");

	const email = $derived($currentUser?.email ?? "");
	const displayName = $derived($currentUser?.name || email.split("@")[0] || "");
	const avatarInitial = $derived(displayName.slice(0, 1).toUpperCase());

	function startEditingName() {
		draftName = $currentUser?.name ?? "";
		editingName = true;
		error = "";
	}

	async function saveName() {
		if (savingName) return;
		savingName = true;
		error = "";
		try {
			await renameAccount(draftName);
			editingName = false;
		} catch (e: any) {
			error = e?.message || "Couldn't update your name";
		} finally {
			savingName = false;
		}
	}

	function handleNameKeydown(event: KeyboardEvent) {
		if (event.key === "Escape") {
			event.stopPropagation();
			editingName = false;
		}
	}

	async function handleAvatarPicked() {
		const file = fileInput.files?.[0];
		fileInput.value = "";
		if (!file) return;
		avatarBusy = true;
		error = "";
		try {
			await changeAccountAvatar(file);
		} catch (e: any) {
			error = e?.message || "Couldn't update your photo";
		} finally {
			avatarBusy = false;
		}
	}
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-center gap-4 min-w-0">
		<button
			type="button"
			class="group relative h-18 w-18 rounded-full bg-ink/9 overflow-hidden shrink-0 flex items-center justify-center text-ink text-2xl font-semibold cursor-pointer disabled:cursor-wait"
			aria-label="Change photo"
			disabled={avatarBusy}
			onclick={() => fileInput.click()}
		>
			{#if $currentUser?.avatar}
				<img src={$currentUser.avatar} alt={displayName} class="h-full w-full object-cover" />
			{:else}
				{avatarInitial}
			{/if}
			<span class="absolute inset-0 flex items-center justify-center bg-canvas/45 transition-opacity duration-200 {avatarBusy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}">
				{#if avatarBusy}
					<ShapeLoader size="24px" />
				{:else}
					<Camera size={22} strokeWidth={2} />
				{/if}
			</span>
		</button>
		<input
			bind:this={fileInput}
			type="file"
			accept="image/*"
			class="hidden"
			onchange={handleAvatarPicked}
		/>

		<div class="min-w-0 flex-1">
			{#if editingName}
				<form class="flex flex-wrap items-center gap-2" onsubmit={(event) => (event.preventDefault(), saveName())}>
					<input
						{@attach (input) => input.select()}
						bind:value={draftName}
						type="text"
						autocomplete="name"
						maxlength="64"
						placeholder={email.split("@")[0]}
						class="min-h-11 flex-1 min-w-40 rounded-2xl bg-ink/8 px-4 text-base text-ink outline-none placeholder:text-ink/30 focus:bg-ink/12"
						disabled={savingName}
						onkeydown={handleNameKeydown}
					/>
					<button
						type="submit"
						class="bg-accent text-on-accent px-4 py-2 rounded-full font-semibold hover:bg-accent/85 transition-colors cursor-pointer disabled:opacity-50"
						disabled={savingName}
					>
						{savingName ? "Saving..." : "Save"}
					</button>
					<button
						type="button"
						class="bg-ink/10 text-ink px-4 py-2 rounded-full font-semibold hover:bg-ink/20 transition-colors cursor-pointer"
						onclick={() => (editingName = false)}
					>
						Cancel
					</button>
				</form>
			{:else}
				<button
					type="button"
					class="group flex max-w-full items-center gap-2 text-left cursor-pointer"
					onclick={startEditingName}
				>
					<span class="text-ink text-2xl font-semibold truncate">{displayName}</span>
					<Pencil size={16} strokeWidth={2} class="shrink-0 text-ink/40 opacity-0 group-hover:opacity-100 transition-opacity" />
				</button>
			{/if}
			<p class="mt-1 text-ink/62 text-sm break-all">{email}</p>
		</div>
	</div>

	{#if error}
		<div class="p-3 rounded-2xl bg-danger/12 text-danger text-sm">{error}</div>
	{/if}
</div>
