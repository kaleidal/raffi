<script lang="ts">
    import { X } from "@lucide/svelte";
    import Dialog from "../../common/dialog/Dialog.svelte";
    import { isAndroidPlatform } from "../../../lib/shell/platform";
    import { openInYouTube } from "../../../lib/android/youtube";

    let {
        visible = $bindable(false),
        ytId,
        onClose = () => {},
    }: {
        visible?: boolean;
        ytId: string;
        onClose?: () => void;
    } = $props();

    function close() {
        visible = false;
        onClose();
    }

    /** In the Android app the YouTube app plays the trailer; the embedded player is only for devices without it. */
    let embedded = $state(!isAndroidPlatform);

    $effect(() => {
        if (visible && !embedded) void handOff(ytId);
    });

    async function handOff(videoId: string) {
        if (await openInYouTube(videoId)) close();
        else embedded = true;
    }
</script>

{#if visible && embedded}
    <Dialog bare onClose={close} class="scheme-dark h-[min(80dvh,760px)] max-w-[1200px] bg-black">
        <button
            class="absolute top-4 right-4 z-10 cursor-pointer rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/75"
            onclick={close}
            aria-label="Close trailer"
        >
            <X size={22} strokeWidth={2} />
        </button>
        <iframe
            src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&modestbranding=1&rel=0`}
            title="Trailer"
            class="h-full w-full"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
        ></iframe>
    </Dialog>
{/if}
