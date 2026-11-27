<script lang="ts">
    import CustomSelect from "../common/controls/CustomSelect.svelte";

    let { seasonsArray = [], currentSeason = $bindable(1) }: { seasonsArray?: number[]; currentSeason?: number } = $props();

    const MAX_SEASON_PILLS = 8;

    const seasonOptions = $derived(seasonsArray.map((season) => ({ value: String(season), label: `Season ${season}` })));
</script>

<div class="mb-[clamp(24px,2.1vw,40px)] flex flex-row flex-wrap gap-[clamp(10px,1.05vw,20px)]">
    {#if seasonsArray.length > MAX_SEASON_PILLS}
        <CustomSelect
            value={String(currentSeason)}
            options={seasonOptions}
            buttonClass="min-w-48 rounded-full bg-accent px-[clamp(20px,1.55vw,30px)] py-[clamp(10px,0.78vw,15px)] text-[clamp(15px,1.04vw,20px)] font-medium text-on-accent"
            menuClass="max-h-[50vh] overflow-y-auto"
            onChange={(value) => (currentSeason = Number(value))}
        />
    {:else}
        {#each seasonsArray as season (season)}
            <button
                class="cursor-pointer rounded-full px-[clamp(20px,1.55vw,30px)] py-[clamp(10px,0.78vw,15px)] text-[clamp(15px,1.04vw,20px)] font-medium backdrop-blur-2xl transition-colors duration-200 {currentSeason === season
                    ? 'bg-accent text-on-accent'
                    : 'bg-ink/10 text-ink/90 hover:bg-ink/15'}"
                onclick={() => (currentSeason = season)}
            >
                Season {season}
            </button>
        {/each}
    {/if}
</div>
