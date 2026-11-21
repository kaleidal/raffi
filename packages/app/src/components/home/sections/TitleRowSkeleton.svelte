<script lang="ts">
    import Skeleton from "../../common/loading/Skeleton.svelte";
</script>

<div class="w-full h-fit flex flex-col gap-4">
    <Skeleton width="min(460px, 42vw)" height="58px" borderRadius="14px" />
    <div class="flex flex-row gap-[20px] overflow-hidden pb-6 pt-3">
        {#each Array(7) as __}
            <Skeleton
                width="200px"
                height="300px"
                borderRadius="16px"
            />
        {/each}
    </div>
</div>
