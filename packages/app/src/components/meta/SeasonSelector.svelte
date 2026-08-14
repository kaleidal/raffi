<script lang="ts">
    export let seasonsArray: number[] = [];
    export let currentSeason: number = 1;
</script>

<div class="flex flex-row flex-wrap gap-[clamp(10px,1.05vw,20px)] mb-[clamp(24px,2.1vw,40px)]">
    {#each seasonsArray as season}
        <button
            class="px-[clamp(20px,1.55vw,30px)] py-[clamp(10px,0.78vw,15px)] {currentSeason === season
                ? 'bg-[#FFFFFF]/20 hover:bg-[#D3D3D3]/20'
                : 'bg-[#FFFFFF]/10 hover:bg-[#D3D3D3]/10'} backdrop-blur-2xl rounded-full text-[#E1E1E1] text-[clamp(15px,1.04vw,20px)] font-poppins font-medium cursor-pointer transition-colors duration-200"
            on:click={() => (currentSeason = season)}
        >
            Season {season}
        </button>
    {/each}
</div>
