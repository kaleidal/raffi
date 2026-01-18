<script lang="ts">
    export let seasonsArray: number[] = [];
    export let currentSeason: number = 1;
</script>

<div class="flex flex-row flex-wrap gap-[20px] mb-10">
    {#each seasonsArray as season}
        <button
            class="px-[30px] py-[15px] {currentSeason === season
                ? 'bg-[#FFFFFF]/20 hover:bg-[#D3D3D3]/20'
                : 'bg-[#FFFFFF]/10 hover:bg-[#D3D3D3]/10'} backdrop-blur-2xl rounded-full text-[#E1E1E1] text-[20px] font-poppins font-medium cursor-pointer transition-colors duration-200"
            on:click={() => (currentSeason = season)}
        >
            Season {season}
        </button>
    {/each}
</div>
