<script lang="ts">
    import type { ShowResponse } from "../../../lib/library/types/meta_types";

    export let metaData: ShowResponse | null;
</script>

{#if metaData && metaData.meta.description}
    <div class="flex flex-col items-start justify-start w-full gap-[20px]">
        <p
            class="text-white/80 text-[clamp(14px,1vw,18px)] font-poppins leading-relaxed max-w-[800px]"
        >
            {metaData.meta.description}
        </p>

        {#if metaData.meta.genre && metaData.meta.genre.length > 0}
            <div class="flex flex-row gap-[10px] flex-wrap">
                {#each metaData.meta.genre as genre}
                    <span
                        class="px-[clamp(12px,0.85vw,16px)] py-[clamp(6px,0.45vw,8px)] bg-white/10 rounded-full text-white text-[clamp(11px,0.75vw,14px)] font-medium backdrop-blur-[10px]"
                    >
                        {genre}
                    </span>
                {/each}
            </div>
        {/if}
    </div>
{/if}
