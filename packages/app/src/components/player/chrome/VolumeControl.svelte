<script lang="ts">
    import { Volume1, Volume2, VolumeX } from "@lucide/svelte";
    import Slider from "../../common/controls/Slider.svelte";
    import PlayerButton from "./PlayerButton.svelte";

    let { volume, onChange }: { volume: number; onChange: (volume: number) => void } = $props();

    let restoreTo = 1;

    function toggleMute() {
        if (volume === 0) return onChange(restoreTo);
        restoreTo = volume;
        onChange(0);
    }
</script>

<div class="flex items-center">
    <PlayerButton label={volume === 0 ? "Unmute" : "Mute"} onclick={toggleMute}>
        {#if volume === 0}
            <VolumeX strokeWidth={2} />
        {:else if volume < 0.5}
            <Volume1 strokeWidth={2} />
        {:else}
            <Volume2 strokeWidth={2} />
        {/if}
    </PlayerButton>
    <div class="w-[clamp(80px,6.5vw,124px)] pr-1">
        <Slider value={volume} label="Volume" onInput={onChange} />
    </div>
</div>
