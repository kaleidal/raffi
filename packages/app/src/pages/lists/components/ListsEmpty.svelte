<script lang="ts">
    import { fade } from "svelte/transition";
    import { createNewList } from "../listActions";

    let name = $state("");
    let creating = $state(false);

    async function create(event: SubmitEvent) {
        event.preventDefault();
        if (!name.trim()) return;
        creating = true;
        await createNewList(name.trim());
        creating = false;
    }
</script>

<div class="flex w-full flex-1 items-center justify-center px-6" in:fade={{ duration: 300 }}>
    <form class="flex w-full max-w-md flex-col items-center gap-6 text-center" onsubmit={create}>
        <div>
            <h2 class="text-[clamp(28px,2.2vw,40px)] font-semibold text-ink">Start a list</h2>
            <p class="mt-2 text-ink/55">Keep what you want to watch in one place.</p>
        </div>
        <div class="flex w-full gap-2">
            <input
                bind:value={name}
                type="text"
                placeholder="Watch later"
                maxlength="64"
                class="min-h-12 min-w-0 flex-1 rounded-full bg-ink/8 px-5 text-ink outline-none placeholder:text-ink/35 focus:bg-ink/12"
            />
            <button
                type="submit"
                disabled={creating || !name.trim()}
                class="cursor-pointer rounded-full bg-accent px-6 font-semibold text-on-accent transition-colors hover:bg-accent/85 disabled:cursor-default disabled:opacity-50"
            >
                Create
            </button>
        </div>
    </form>
</div>
