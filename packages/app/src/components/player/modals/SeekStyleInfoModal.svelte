<script lang="ts">
    import { fade } from "svelte/transition";
    import { fullscreenPortal } from "../../common/portal";
    import SeekStyleChoice from "../../../pages/player/components/SeekStyleChoice.svelte";
    import type { SeekBarStyle } from "../../../pages/player/controls/seekStyle";

    let { seekBarStyle, onStyleChange, onAcknowledge }: {
        seekBarStyle: SeekBarStyle;
        onStyleChange: (style: SeekBarStyle) => void;
        onAcknowledge: () => void;
    } = $props();
</script>

<div
    use:fullscreenPortal
    class="raffi-modal-backdrop fixed inset-0 z-[300] flex items-end bg-canvas/80 p-[clamp(20px,3.4vw,64px)] pb-[clamp(40px,9vh,110px)] text-ink backdrop-blur-md scheme-dark"
    transition:fade={{ duration: 200 }}
>
    <SeekStyleChoice style={seekBarStyle} onChange={onStyleChange} onContinue={onAcknowledge} />
</div>
