<script lang="ts">
    import { fade } from 'svelte/transition';

    export let screenshots: string[] = [];
</script>

<div in:fade={{ duration: 300 }} class="flex flex-col gap-[60px] w-full pb-20">
    {#each screenshots as src, i}
        <div class="w-full aspect-video bg-white p-3 border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-xl overflow-hidden shrink-0 transform {i % 2 === 0 ? 'rotate-1' : '-rotate-1'} hover:rotate-0 transition-transform duration-300">
            <div class="w-full h-full border border-neutral-200 rounded-lg overflow-hidden">
                <img {src} alt="Screenshot {i}" class="w-full h-full object-cover" />
            </div>
        </div>
    {/each}
</div>