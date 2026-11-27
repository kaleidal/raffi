<script lang="ts">
    import { ChevronLeft } from "@lucide/svelte";
    import PlayerButton from "./PlayerButton.svelte";

    let { onclick }: { onclick: () => void } = $props();
</script>

<div class="back-button pointer-events-auto">
    <PlayerButton label="Close player" {onclick}>
        <ChevronLeft strokeWidth={2} />
    </PlayerButton>
</div>

<style>
    .back-button {
        margin: calc(-1 * clamp(10px, 0.675vw, 13px));
    }
</style>
