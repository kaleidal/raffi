<script lang="ts">
    import { fade } from "svelte/transition";
    import LoadingSpinner from "./LoadingSpinner.svelte";
</script>

<div class="pointer-events-none fixed inset-0 z-30 flex items-center justify-center" out:fade={{ duration: 200 }}>
    <LoadingSpinner size="60px" />
</div>
