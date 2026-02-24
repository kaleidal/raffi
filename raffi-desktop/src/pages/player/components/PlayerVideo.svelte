<script lang="ts">
    export let videoElem: HTMLVideoElement | undefined = undefined;
    export let canvasElem: HTMLCanvasElement | undefined = undefined;
    export let objectFit: "contain" | "cover";
    export let showCanvas: boolean;
    export let hidden: boolean = false;
</script>

<video
    bind:this={videoElem}
    class="absolute top-0 left-0 w-full h-full bg-black {hidden ? 'hidden' : 'block'} {objectFit === 'contain'
        ? 'object-contain'
        : 'object-cover'}"
    crossorigin="anonymous"
    playsinline
    disablepictureinpicture
    on:timeupdate
    on:play
    on:pause
    on:ended
    on:click
    on:waiting
    on:playing
    on:canplay
>
    <track kind="captions" />
</video>

<canvas
    bind:this={canvasElem}
    class="absolute top-0 left-0 w-full h-full bg-black {objectFit === 'contain'
        ? 'object-contain'
        : 'object-cover'} {showCanvas && !hidden ? 'block' : 'hidden'}"
></canvas>

<style>
    /* Hide default controls */
    video::-webkit-media-controls {
        display: none !important;
    }
    video::-webkit-media-controls-enclosure {
        display: none !important;
    }

    /* Subtitle styling */
    video::cue {
        background-color: transparent !important;
        text-shadow: 0 0 4px black;
        font-family: inherit;
    }
</style>
