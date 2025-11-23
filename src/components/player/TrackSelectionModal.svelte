<script lang="ts">
    import { fade, scale } from "svelte/transition";
    import { createEventDispatcher, onMount } from "svelte";

    export let title: string;
    export let tracks: {
        id: string | number;
        label: string;
        selected?: boolean;
        group?: string;
    }[];

    const dispatch = createEventDispatcher();

    function select(track: any) {
        dispatch("select", track);
        dispatch("close");
    }

    function close() {
        dispatch("close");
    }

    // Group tracks if needed
    $: groupedTracks = tracks.reduce(
        (acc, track) => {
            const group = track.group || "Default";
            if (!acc[group]) acc[group] = [];
            acc[group].push(track);
            return acc;
        },
        {} as Record<string, typeof tracks>,
    );
</script>

<div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-default"
    transition:fade={{ duration: 200 }}
    on:click={close}
    on:keydown={(e) => e.key === "Escape" && close()}
    role="button"
    tabindex="0"
    aria-label="Close modal"
>
    <div
        class="bg-[#181818] rounded-[32px] p-8 w-[400px] max-h-[80vh] overflow-y-auto flex flex-col gap-6"
        transition:scale={{ duration: 200, start: 0.9 }}
        on:click|stopPropagation
        on:keydown|stopPropagation
        role="button"
        tabindex="-1"
    >
        <div class="flex items-center justify-between">
            <h2 class="text-2xl font-poppins font-bold text-white">{title}</h2>
            <button
                class="p-2 hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                on:click={close}
                aria-label="Close"
            >
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><path d="M18 6L6 18M6 6l12 12" /></svg
                >
            </button>
        </div>

        <div class="flex flex-col gap-6">
            {#each Object.entries(groupedTracks) as [group, groupTracks]}
                <div class="flex flex-col gap-3">
                    {#if Object.keys(groupedTracks).length > 1}
                        <h3
                            class="text-sm font-poppins font-medium text-white/40 uppercase tracking-wider"
                        >
                            {group}
                        </h3>
                    {/if}
                    <div class="flex flex-col gap-2">
                        {#each groupTracks as track}
                            <button
                                class="flex items-center justify-between p-4 rounded-xl transition-all duration-200 cursor-pointer {track.selected
                                    ? 'bg-white text-black'
                                    : 'bg-white/5 text-white hover:bg-white/10'}"
                                on:click={() => select(track)}
                            >
                                <span class="font-poppins font-medium"
                                    >{track.label}</span
                                >
                                {#if track.selected}
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="3"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><polyline
                                            points="20 6 9 17 4 12"
                                        /></svg
                                    >
                                {/if}
                            </button>
                        {/each}
                    </div>
                </div>
            {/each}
        </div>
    </div>
</div>
