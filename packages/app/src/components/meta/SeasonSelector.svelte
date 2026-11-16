<script lang="ts">
    export let seasonsArray: number[] = [];
    export let currentSeason: number = 1;
</script>

<div class="flex flex-row flex-wrap gap-[clamp(10px,1.05vw,20px)] mb-[clamp(24px,2.1vw,40px)]">
    {#each seasonsArray as season}
        <button
            class="px-[clamp(20px,1.55vw,30px)] py-[clamp(10px,0.78vw,15px)] {currentSeason === season
                ? 'bg-accent text-on-accent'
                : 'bg-ink/10 text-ink/90 hover:bg-ink/15'} backdrop-blur-2xl rounded-full text-[clamp(15px,1.04vw,20px)] font-medium cursor-pointer transition-colors duration-200"
            on:click={() => (currentSeason = season)}
        >
            Season {season}
        </button>
    {/each}
</div>
