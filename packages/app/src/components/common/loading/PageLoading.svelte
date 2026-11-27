<script lang="ts">
    import { fade } from "svelte/transition";
    import ShapeLoader from "./ShapeLoader.svelte";
</script>

<div class="pointer-events-none fixed inset-0 z-30 flex items-center justify-center" out:fade={{ duration: 200 }}>
    <ShapeLoader size="60px" />
</div>
